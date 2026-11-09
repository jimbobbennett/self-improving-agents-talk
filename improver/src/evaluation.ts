import OpenAI from "openai";
import promptSet from "../../evals/eval-prompts.json" with { type: "json" };
import type { CandidateResult, DatasetExample, EvaluatorName, EvaluatorScore } from "./types.js";

type PromptDefinition = { name: string; template: string };
const judgeModel = process.env.IMPROVER_JUDGE_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.6-luna";
const client = new OpenAI();

function fill(template: string, example: DatasetExample, output: string, context: string) {
  return template.replaceAll("{input}", String(example.input ?? "")).replaceAll("{output}", output).replaceAll("{context}", context);
}

async function judge(name: string, definition: PromptDefinition, example: DatasetExample, output: string, context: string): Promise<EvaluatorScore> {
  const response = await client.responses.create({
    model: judgeModel,
    input: [{ role: "user", content: fill(definition.template, example, output, context) }],
    tools: [{
      type: "function",
      name: "submit_evaluation",
      description: "Return the evaluator's categorical label and a brief explanation.",
      parameters: {
        type: "object",
        properties: {
          label: { type: "string", enum: ["pass", "fail"] },
          explanation: { type: "string" },
        },
        required: ["label", "explanation"],
        additionalProperties: false,
      },
      strict: true,
    }],
    tool_choice: { type: "function", name: "submit_evaluation" },
    parallel_tool_calls: false,
  });
  const call = response.output.find((item) => item.type === "function_call" && item.name === "submit_evaluation");
  if (!call || call.type !== "function_call") throw new Error(`Evaluator ${name} did not return the required structured result.`);
  const parsed: unknown = JSON.parse(call.arguments);
  if (!parsed || typeof parsed !== "object" || !("label" in parsed) || !("explanation" in parsed)) {
    throw new Error(`Evaluator ${name} returned malformed structured arguments.`);
  }
  const result = parsed as { label: unknown; explanation: unknown };
  if (result.label !== "pass" && result.label !== "fail") throw new Error(`Evaluator ${name} returned an invalid label: ${String(result.label)}`);
  if (typeof result.explanation !== "string") throw new Error(`Evaluator ${name} returned a non-string explanation.`);
  return {
    label: result.label,
    explanation: result.explanation,
    tokensIn: response.usage?.input_tokens,
    tokensOut: response.usage?.output_tokens,
  };
}

export function scoreToolContract(records: Array<{ input: string; output?: string; error?: string }>): EvaluatorScore {
  const invalidCalls = records.filter((record) => record.error !== undefined).length;
  return {
    label: records.length === 0 ? "not_applicable" : invalidCalls === 0 ? "pass" : "fail",
    calls: records.length,
    invalidCalls,
    explanation: records.length === 0
      ? "No search tool call was made."
      : invalidCalls === 0
        ? "No tool call used a rejected source_type."
        : `${invalidCalls} tool call(s) used a rejected source_type and required a retry.`,
  };
}

export async function scoreResult(example: DatasetExample, output: string, context: string, toolCallRecords: Array<{ input: string; output?: string; error?: string }>): Promise<CandidateResult["scores"]> {
  const definitions = promptSet as Record<string, PromptDefinition>;
  const names = ["factual_grounding", "dish_classification", "source_integrity", "search_selection"] as const;
  const entries = await Promise.all(names.map(async (name) => [name, await judge(name, definitions[name], example, output, context)] as const));
  const toolScore = scoreToolContract(toolCallRecords);
  return { ...Object.fromEntries(entries), tool_contract: toolScore } as CandidateResult["scores"];
}

export function exampleInput(example: DatasetExample): string {
  const additional = example.additional_properties ?? {};
  const input = example.input ?? additional.input ?? example.question ?? example.prompt;
  if (typeof input !== "string" || !input.trim()) throw new Error(`Dataset example ${example.id} has no input/question/prompt string.`);
  return input;
}

export function historicalLabels(example: DatasetExample): Record<string, unknown> {
  return Object.fromEntries(Object.entries(example).filter(([key]) => /^(search_selection|factual_grounding|dish_classification|source_integrity|tool_contract)$/.test(key)));
}
