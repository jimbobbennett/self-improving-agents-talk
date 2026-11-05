// Import tracing before the agent SDK so the SDK is instrumented before a run begins.
import { flushTracing } from "./instrumentation.js";
import { runPlanner } from "./run-agent.js";

const input = process.argv.slice(2).join(" ").trim();
if (!input) {
  console.error('Usage: npm run demo -- "Is marshmallow sweet potato casserole real? Plan a menu for 8."');
  process.exitCode = 2;
} else {
  const variant = process.env.DEMO_VARIANT === "improved" ? "improved" : "baseline";
  try {
    const result = await runPlanner(input, variant);
    console.log(`\n[${variant} | run ${result.runId}]\n${result.answer}`);
    console.log(`\n[tool-contract eval: ${result.evaluation.label}] ${result.evaluation.reason}`);
    console.log(`[search metrics] ${result.metrics.searchToolCalls} call(s), ${result.metrics.invalidSourceTypeCalls} invalid value(s), ${result.metrics.completedSearches} completed search(es)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await flushTracing();
  }
}
