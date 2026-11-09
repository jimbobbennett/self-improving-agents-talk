# Next improvement iteration

Dataset: thanksgiving-food-lore-traces-v1, 117 examples.

The acceptance gate tolerates one additional failing example per evaluator and still requires an aggregate gain above one-label resolution, no more than 10% increase in mean cost or p95 latency, and no failed runs.

| Version | Factual | Dish | Source | Search | Tool contract pass/applicable | Macro quality | Tool calls | Mean cost/example | P95 ms | Selection |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Prevalence parent | 116/117 | 116/117 | 114/117 | 113/117 | 20/117 (0 N/A) | 0.981 | 243 | $0.001803 | 9389 | current best |
| combined-enum-prevalence | 117/117 | 116/117 | 115/117 | 116/117 | 117/117 (0 N/A) | 0.991 | 142 | $0.001677 | 6704 | eligible |
| ground-history-claims | 113/117 | 113/117 | 117/117 | 117/117 | 14/117 (0 N/A) | 0.983 | 264 | $0.001858 | 9275 | rejected: factual_grounding regressed by more than one example versus current best; dish_classification regressed by more than one example versus current best; tool_contract regressed by more than one example versus current best; aggregate quality gain (0.0021) did not exceed one-evaluator/one-example resolution (0.0021) |
| selective-search | 117/117 | 117/117 | 111/117 | 115/117 | 4/90 (27 N/A) | 0.983 | 273 | $0.001828 | 8397 | rejected: source_integrity regressed by more than one example versus current best; aggregate quality gain (0.0021) did not exceed one-evaluator/one-example resolution (0.0021) |

Estimated model-token cost for these three candidate batches: $0.62746. Codex SDK usage is separately metered and not included.

## AX experiments

- combined-enum-prevalence: thanksgiving-2026-11-06T-next-i2-combined-enum-prevalence (RXhwZXJpbWVudDoxODg0OTc6em4xcg==)
- ground-history-claims: thanksgiving-2026-11-06T-next-i2-ground-history-claims (RXhwZXJpbWVudDoxODg1MjE6QUlSeQ==)
- selective-search: thanksgiving-2026-11-06T-next-i2-selective-search (RXhwZXJpbWVudDoxODg1Mzg6am5icA==)

Only the combined enum + prevalence candidate passed the gate. The historical-grounding proposal regressed factual grounding and dish classification by more than one example. The selective-search proposal regressed source integrity by more than one example; 27 rows did not call the tool, so Tool Contract was not applicable on those rows.
