# Thanksgiving agent improvement report

Generated: 2026-11-06T18:45:52.413Z

App model: gpt-5.6-luna; evaluator model: gpt-5.6-luna.

Dataset: thanksgiving-food-lore-traces-v1 (RGF0YXNldFZlcnNpb246NDAyNjcxOi9FTzY=)

## Baseline and accepted versions

| Version | Quality macro avg | p95 latency ms | Mean model cost/example | AX experiment |
|---|---:|---:|---:|---|
| baseline | 0.940 | 9101 | $0.00184 | RXhwZXJpbWVudDoxODgxODQ6ZlJvUw== |

## Candidate versions

| Iteration | Candidate | Parent | Quality | Evaluator rates | Mean cost/example | p95 latency ms | Selection |
|---:|---|---|---:|---|---:|---:|---|
| 1 | i1-candidate1 | baseline | 0.932 | factual_grounding: 0.98; dish_classification: 0.99; source_integrity: 0.97; search_selection: 0.78; tool_contract: 1.00 | $0.00165 | 6817 | dish_classification regressed versus current best; search_selection regressed versus current best; aggregate quality gain (-0.0085) did not exceed one-evaluator/one-example resolution (0.0021) |
| 1 | i1-candidate2 | unknown | 1.000 | factual_grounding: 1.00; dish_classification: 1.00; source_integrity: 1.00; search_selection: 1.00; tool_contract: 1.00 | unknown | 0 | Duplicate patch generated within this iteration; Changed one line in [tools.ts](/var/folders/17/xtcg3n390mb262lrklm_r6t40000gn/T/thanksgiving-improver-13tWzh/i1-candidate2/original/src/tools.ts:118): the `source_type` parameter now uses the `history`/`social` enum instead of accepting any string. This makes the tool schema match the backing service’s accepted values, targeting the repeated invalid-call failures. I did not run the evaluator; its measurement will determine the result. |
| 1 | i1-candidate3 | baseline | 0.944 | factual_grounding: 1.00; dish_classification: 1.00; source_integrity: 0.97; search_selection: 0.80; tool_contract: 1.00 | $0.00164 | 6942 | search_selection regressed versus current best |

## Candidate summaries

### Iteration 1: i1-candidate1

Parent: baseline. Rejected: dish_classification regressed versus current best; search_selection regressed versus current best; aggregate quality gain (-0.0085) did not exceed one-evaluator/one-example resolution (0.0021)

Changed one line in [tools.ts](/var/folders/17/xtcg3n390mb262lrklm_r6t40000gn/T/thanksgiving-improver-13tWzh/i1-candidate1/original/src/tools.ts): `source_type` now uses the `history`/`social` enum in the tool schema instead of accepting any string. This targets the measured rejected-source-type retries. I did not run the evaluator, so I’m not claiming a score improvement.

### Iteration 1: i1-candidate2

Parent: unknown. Rejected: Duplicate patch generated within this iteration; Changed one line in [tools.ts](/var/folders/17/xtcg3n390mb262lrklm_r6t40000gn/T/thanksgiving-improver-13tWzh/i1-candidate2/original/src/tools.ts:118): the `source_type` parameter now uses the `history`/`social` enum instead of accepting any string. This makes the tool schema match the backing service’s accepted values, targeting the repeated invalid-call failures. I did not run the evaluator; its measurement will determine the result.

Duplicate patch generated within this iteration; Changed one line in [tools.ts](/var/folders/17/xtcg3n390mb262lrklm_r6t40000gn/T/thanksgiving-improver-13tWzh/i1-candidate2/original/src/tools.ts:118): the `source_type` parameter now uses the `history`/`social` enum instead of accepting any string. This makes the tool schema match the backing service’s accepted values, targeting the repeated invalid-call failures. I did not run the evaluator; its measurement will determine the result.

### Iteration 1: i1-candidate3

Parent: baseline. Rejected: search_selection regressed versus current best

Changed only [original/src/tools.ts](/var/folders/17/xtcg3n390mb262lrklm_r6t40000gn/T/thanksgiving-improver-13tWzh/i1-candidate3/original/src/tools.ts:116): `source_type` now uses the `"history" | "social"` enum already enforced by the search service. This targets the measured rejected-source retries. I did not run tests or claim a score improvement; the evaluator will measure the change.


The JSON report and iteration files include proposal summaries, per-evaluator pass/fail counts, full outputs/evidence, AX experiment IDs, and rejection reasons.

## Baseline evaluator pass rates

{
  "factual_grounding": {
    "pass": 115,
    "fail": 2,
    "notApplicable": 0,
    "rate": 0.9829059829059829
  },
  "dish_classification": {
    "pass": 117,
    "fail": 0,
    "notApplicable": 0,
    "rate": 1
  },
  "source_integrity": {
    "pass": 111,
    "fail": 6,
    "notApplicable": 0,
    "rate": 0.9487179487179487
  },
  "search_selection": {
    "pass": 97,
    "fail": 20,
    "notApplicable": 0,
    "rate": 0.8290598290598291
  },
  "tool_contract": {
    "pass": 0,
    "fail": 117,
    "notApplicable": 0,
    "rate": 0
  }
}

## Accepted best evaluator pass rates

{
  "factual_grounding": {
    "pass": 115,
    "fail": 2,
    "notApplicable": 0,
    "rate": 0.9829059829059829
  },
  "dish_classification": {
    "pass": 117,
    "fail": 0,
    "notApplicable": 0,
    "rate": 1
  },
  "source_integrity": {
    "pass": 111,
    "fail": 6,
    "notApplicable": 0,
    "rate": 0.9487179487179487
  },
  "search_selection": {
    "pass": 97,
    "fail": 20,
    "notApplicable": 0,
    "rate": 0.8290598290598291
  },
  "tool_contract": {
    "pass": 0,
    "fail": 117,
    "notApplicable": 0,
    "rate": 0
  }
}

## Stop reason

iteration 1 produced no eligible strict improvement

Estimated app and evaluator model cost total: $0.60054. Rates per million tokens (USD): {"appInput":0.2,"appOutput":1.2,"judgeInput":0.2,"judgeOutput":1.2,"source":{"app":"https://developers.openai.com/api/docs/pricing (checked 2026-11-06)","judge":"https://developers.openai.com/api/docs/pricing (checked 2026-11-06)"}}.

Codex SDK patch-generation usage is metered separately and is not included. Search-tool fixture costs are simulated, not actual charges.

Guardrails: {"costAndP95LatencyMaxIncrease":"10% vs baseline and current best","maximumIterations":1}

Evaluation scores are computed locally from the versioned prompts and rules; any AX experiment annotations are copies of those local results, not AX evaluator task scores. Continuous trace-monitor tasks are not represented as having scored these experiment rows.
