// Runs inside a candidate worktree so every variant uses that worktree's app code.
import { readFile, writeFile } from "node:fs/promises";
import type { CandidateResult, DatasetExample } from "./types.js";

const examplesPath = process.argv[2];
const outputPath = process.argv[3];
if (!examplesPath || !outputPath) throw new Error("Usage: candidate-runner <dataset-examples.json> <results.json>");

// Register the Arize OpenInference instrumentation before dynamically loading the agent SDK.
const { flushTracing } = await import(new URL("../../original/src/instrumentation.ts", import.meta.url).href);
const { runPlanner } = await import(new URL("../../original/src/run-agent.ts", import.meta.url).href);
const { scoreResult, exampleInput, historicalLabels } = await import("./evaluation.js");

const examples = JSON.parse(await readFile(examplesPath, "utf8")) as DatasetExample[];
const results: CandidateResult[] = [];
try {
  for (let index = 0; index < examples.length; index++) {
    const example = examples[index]!;
    const input = exampleInput(example);
    const started = performance.now();
    try {
      const run = await runPlanner(input, "baseline");
      const agentLatencyMs = performance.now() - started;
      // Match the context representation persisted on the AX root span so local
      // judges and AX judges see the same evidence ordering and boundaries.
      const context = JSON.stringify(run.metrics.searchEvidence);
      const evaluationStarted = performance.now();
      const scores = await scoreResult(example, run.answer, context, run.metrics.toolCallRecords);
      const evaluationLatencyMs = performance.now() - evaluationStarted;
      const judgeTokensIn = Object.values(scores).reduce((n, score) => n + (score.tokensIn ?? 0), 0);
      const judgeTokensOut = Object.values(scores).reduce((n, score) => n + (score.tokensOut ?? 0), 0);
      results.push({ exampleId: example.id, input, output: run.answer, context, latencyMs: agentLatencyMs, evaluationLatencyMs, toolCalls: run.metrics.searchToolCalls, toolCallRecords: run.metrics.toolCallRecords, appTokensIn: run.usage.inputTokens, appTokensOut: run.usage.outputTokens, judgeTokensIn, judgeTokensOut, tokensIn: run.usage.inputTokens + judgeTokensIn, tokensOut: run.usage.outputTokens + judgeTokensOut, scores });
    } catch (error) {
      results.push({ exampleId: example.id, input, output: "", context: "", latencyMs: performance.now() - started, toolCalls: 0, error: error instanceof Error ? error.message : String(error), appTokensIn: 0, appTokensOut: 0, judgeTokensIn: 0, judgeTokensOut: 0, scores: {
        factual_grounding: { label: "fail", explanation: "Agent run failed." },
        dish_classification: { label: "fail", explanation: "Agent run failed." },
        source_integrity: { label: "fail", explanation: "Agent run failed." },
        search_selection: { label: "fail", explanation: "Agent run failed." },
        tool_contract: { label: "fail", explanation: "Agent run failed." },
      } });
    }
    const previous = historicalLabels(example);
    console.error(`${index + 1}/${examples.length} ${example.id}: ${results.at(-1)?.error ? "ERROR" : "scored"}${Object.keys(previous).length ? " (prior labels retained as reference only)" : ""}`);
  }
} finally {
  await flushTracing();
}
await writeFile(outputPath, JSON.stringify(results, null, 2));
