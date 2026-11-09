# Distinct prevalence proposal

Experiment: thanksgiving-2026-11-06T-distinct-prevalence-candidate (AX ID RXhwZXJpbWVudDoxODgyNzU6K1A0Qg==)

Proposal: add explicit prevalence limits for curated history and high-engagement social evidence. This changes only agent instructions and keeps the source_type bug for a separate comparison.

| Evaluator | Baseline pass | Candidate pass | Baseline rate | Candidate rate |
|---|---:|---:|---:|---:|
| factual_grounding | 115/117 | 116/117 | 0.983 | 0.991 |
| dish_classification | 117/117 | 116/117 | 1.000 | 0.991 |
| source_integrity | 111/117 | 114/117 | 0.949 | 0.974 |
| search_selection | 97/117 | 113/117 | 0.829 | 0.966 |
| tool_contract | 0/117 | 20/117 | 0.000 | 0.171 |

Aggregate quality: 0.9402 → 0.9808.

Mean cost/example: $0.001836 → $0.001803. Candidate batch estimated token cost: $0.21089.

Mean agent latency: 6923 ms → 6628 ms; p95: 9101 ms → 9389 ms.

Gate: rejected — dish_classification regressed versus current best.
