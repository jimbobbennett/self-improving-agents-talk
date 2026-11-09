// Register tracing before importing the runner and agent SDK modules.
import { flushTracing } from "./instrumentation.js";
import { runPlanner, type DemoVariant } from "./run-agent.js";
import querySet from "../../evals/eval-queries.json" with { type: "json" };

const limit = Number(process.env.DEMO_BENCHMARK_LIMIT ?? querySet.cases.length);
const cases = querySet.cases.slice(0, Math.max(0, limit));
const results = [];

try {
  for (const testCase of cases) {
    const result = await runPlanner(testCase.query, testCase.variant as DemoVariant);
    const expectedToolLabel = testCase.expected_evaluators.tool_contract;
    const actualToolLabel = result.evaluation.label.toLowerCase();
    results.push({
      id: testCase.id,
      runId: result.runId,
      variant: result.variant,
      target: testCase.expected_run,
      expectedEvaluators: testCase.expected_evaluators,
      toolContract: {
        expected: expectedToolLabel,
        actual: expectedToolLabel ? actualToolLabel : "not_applicable",
        matches: expectedToolLabel ? expectedToolLabel === actualToolLabel : null,
      },
      metrics: result.metrics,
      answer: result.answer,
    });
    console.log(JSON.stringify(results.at(-1)));
  }
  const checkable = results.filter((result) => result.toolContract.matches !== null);
  const passed = checkable.filter((result) => result.toolContract.matches).length;
  console.log(`\nCompleted ${results.length}/${querySet.cases.length} cases. Tool-contract local score: ${passed}/${checkable.length}. Judge evaluations are recorded as AX traces and score after an AX task is configured.`);
} finally {
  await flushTracing();
}
