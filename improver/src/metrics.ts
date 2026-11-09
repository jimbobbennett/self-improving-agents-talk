import type { CandidateResult, EvaluatorName, Metrics } from "./types.js";
import { ratesForModel } from "./pricing.js";

export const evaluators: EvaluatorName[] = ["factual_grounding", "dish_classification", "source_integrity", "search_selection", "tool_contract"];

export function summarize(results: CandidateResult[]): Metrics {
  const quality = Object.fromEntries(evaluators.map((name) => {
    const pass = results.filter((r) => r.scores[name].label === "pass").length;
    const fail = results.filter((r) => r.scores[name].label === "fail").length;
    const notApplicable = results.filter((r) => r.scores[name].label === "not_applicable").length;
    const applicable = pass + fail;
    return [name, { pass, fail, notApplicable, rate: applicable ? pass / applicable : 1 }];
  })) as Metrics["quality"];
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const errors = results.filter((r) => r.error).length;
  const appModel = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";
  const judgeModel = process.env.IMPROVER_JUDGE_MODEL ?? appModel;
  const appRates = ratesForModel(appModel, process.env.MODEL_INPUT_COST_PER_MILLION, process.env.MODEL_OUTPUT_COST_PER_MILLION);
  const judgeRates = ratesForModel(judgeModel, process.env.JUDGE_INPUT_COST_PER_MILLION, process.env.JUDGE_OUTPUT_COST_PER_MILLION);
  const allHaveTokens = results.every((r) => Number.isFinite(r.appTokensIn) && Number.isFinite(r.appTokensOut) && Number.isFinite(r.judgeTokensIn) && Number.isFinite(r.judgeTokensOut));
  const knownPricing = appRates !== undefined && judgeRates !== undefined;
  const meanCostUsd = allHaveTokens && knownPricing && results.length
    ? results.reduce((sum, r) => sum + (r.appTokensIn! * appRates!.input + r.appTokensOut! * appRates!.output + r.judgeTokensIn! * judgeRates!.input + r.judgeTokensOut! * judgeRates!.output) / 1_000_000, 0) / results.length
    : undefined;
  const aggregateQuality = (quality.factual_grounding.rate + quality.dish_classification.rate + quality.source_integrity.rate + quality.search_selection.rate) / 4;
  return {
    examples: results.length,
    quality,
    aggregateQuality,
    meanLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    p95LatencyMs: latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : 0,
    meanCostUsd,
    toolCalls: results.reduce((n, r) => n + r.toolCalls, 0),
    errors,
  };
}

export function eligible(candidate: Metrics, baseline: Metrics, best: Metrics): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (candidate.errors > 0) reasons.push(`${candidate.errors} failed or timed-out examples`);
  for (const name of evaluators) {
    if (candidate.quality[name].fail > best.quality[name].fail + 1) {
      reasons.push(`${name} regressed by more than one example versus current best`);
    }
  }
  const aggregateGain = candidate.aggregateQuality - best.aggregateQuality;
  const oneLabelResolution = candidate.examples > 0 ? 1 / (4 * candidate.examples) : 0;
  if (aggregateGain <= oneLabelResolution) {
    reasons.push(`aggregate quality gain (${aggregateGain.toFixed(4)}) did not exceed one-evaluator/one-example resolution (${oneLabelResolution.toFixed(4)})`);
  }
  const limit = (value: number) => value * 1.1;
  if (candidate.p95LatencyMs > limit(baseline.p95LatencyMs) || candidate.p95LatencyMs > limit(best.p95LatencyMs)) reasons.push("p95 latency exceeded the 10% guardrail");
  if (candidate.meanCostUsd === undefined || baseline.meanCostUsd === undefined || best.meanCostUsd === undefined) reasons.push("monetary model cost is unknown; configure token prices to pass the cost gate");
  else if (candidate.meanCostUsd > limit(baseline.meanCostUsd) || candidate.meanCostUsd > limit(best.meanCostUsd)) reasons.push("mean model cost exceeded the 10% guardrail");
  return { ok: reasons.length === 0, reasons };
}
