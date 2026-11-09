# Evaluation materials

This folder contains the prompts, example queries, result snapshots, and Arize AX evaluator/task configuration for the demo.

- `eval-prompts.json`: judge prompts and intended labels for the AX evaluators.
- `eval-queries.json`: small set of representative demo cases.
- `eval-queries-100.json` and `eval-results-100.json`: the larger batch and its recorded results.
- `ax-evaluators.json` and `ax-task-config.json`: evaluator definitions and task configuration notes.
- `thanksgiving-trace-dataset.json`: local snapshot of the 117 fully scored traces used to create the `thanksgiving-food-lore-traces-v1` dataset in AX.

The live search tool's evidence fixture is kept separately in [`../data/dish-benchmark.json`](../data/dish-benchmark.json).
