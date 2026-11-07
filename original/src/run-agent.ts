import { Runner } from "@openai/agents";
import { randomUUID } from "node:crypto";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { OpenInferenceSpanKind, SemanticConventions } from "@arizeai/openinference-semantic-conventions";
import { createThanksgivingAgent } from "./agent.js";
import type { DemoMetrics } from "./tools.js";

export type DemoVariant = "baseline" | "improved";
export type ToolCallRecord = { input: string; output?: string; error?: string };
const tracer = trace.getTracer("thanksgiving-food-lore-demo");

export async function runPlanner(input: string, variant: DemoVariant) {
  const demoRunId = randomUUID();
  const metrics: DemoMetrics = { searchToolCalls: 0, invalidSourceTypeCalls: 0, completedSearches: 0, searchEvidence: [], toolCallRecords: [] };
  const runner = new Runner({
    workflowName: "thanksgiving-food-lore-demo",
    traceMetadata: { demo_variant: variant, demo_run_id: demoRunId },
    traceIncludeSensitiveData: true,
  });
  // Keep a request span active so model-visible tool errors and tool retries
  // remain grouped with the OpenAI Agents SDK spans in one trace.
  return tracer.startActiveSpan("thanksgiving_demo_request", async (span) => {
    span.setAttribute(SemanticConventions.OPENINFERENCE_SPAN_KIND, OpenInferenceSpanKind.CHAIN);
    span.setAttribute(SemanticConventions.INPUT_VALUE, input);
    span.setAttribute("demo.request_input", input);
    span.setAttribute("demo.variant", variant);
    span.setAttribute("demo.run_id", demoRunId);
    try {
      const result = await runner.run(createThanksgivingAgent(variant, metrics), input, { maxTurns: 8 });
      const answer = String(result.finalOutput ?? "");
      const passed = metrics.invalidSourceTypeCalls === 0;
      span.setAttribute(SemanticConventions.OUTPUT_VALUE, answer);
      span.setAttribute("demo.response_output", answer);
      span.setAttribute("demo.context", JSON.stringify(metrics.searchEvidence));
      span.setAttribute("demo.tool_call_records", JSON.stringify(metrics.toolCallRecords));
      span.setAttribute("demo.search_tool_calls", metrics.searchToolCalls);
      span.setAttribute("demo.invalid_source_type_calls", metrics.invalidSourceTypeCalls);
      span.setAttribute("demo.completed_searches", metrics.completedSearches);
      span.setAttribute("demo.eval.tool_contract_passed", passed);
      span.setStatus({ code: SpanStatusCode.OK });
      return {
        runId: demoRunId,
        variant,
        answer,
        usage: {
          inputTokens: result.state.usage.inputTokens,
          outputTokens: result.state.usage.outputTokens,
        },
        metrics: {
          searchToolCalls: metrics.searchToolCalls,
          invalidSourceTypeCalls: metrics.invalidSourceTypeCalls,
          completedSearches: metrics.completedSearches,
          searchEvidence: [...metrics.searchEvidence],
          toolCallRecords: metrics.toolCallRecords.map((record) => ({ ...record })),
        },
        evaluation: {
          passed,
          label: passed ? "PASS" : "FAIL",
          reason: passed
            ? "No invalid source_type was sent to the search tool."
            : `${metrics.invalidSourceTypeCalls} invalid source_type call(s) required a retry.`,
        },
      };
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}
