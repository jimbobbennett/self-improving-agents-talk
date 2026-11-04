# Thanksgiving Food Lore Planner

A demo for a self-improving Thanksgiving agent. The agent helps a first-time host distinguish real dishes from social-media stunts, separate modern traditions from claims about 1621, and sketch a menu for guests.

## Run the demo

Requires Node.js 22 or later and an OpenAI API key. To send traces to Arize AX, set these environment variables in your shell:

```sh
export OPENAI_API_KEY="..."
export ARIZE_API_KEY="..."
export ARIZE_SPACE_ID="..."
export ARIZE_PROJECT_NAME="thanksgiving-food-lore-demo"
```

Do not commit credentials. The demo warns and runs without AX tracing when the Arize key or space is missing.

```sh
npm install
npm run build
npm run demo -- "Is green bean casserole a Pilgrim dish? Plan a menu for 8 with one dairy-free guest."
```

Launch the local web UI with:

```sh
npm start
```

Then open `http://127.0.0.1:3000`. The page offers sample questions about real, viral, and synthetic dishes, plus the baseline/improved planner switch. Planner requests run through the same AX-traced agent as the CLI. When AX tracing is configured, the status pill links directly to the project.

Run the eight-case local pass/fail query set sequentially with:

```sh
npm run benchmark
```

The list is in [eval-queries.json](data/eval-queries.json). Four cases use the improved variant as passing controls; four use the baseline to exercise the enum retry and search-selection checks. Each run emits an AX trace. Limit spend while iterating with `DEMO_BENCHMARK_LIMIT=1 npm run benchmark`.

Set `DEMO_VARIANT=improved` to run the improved prompt:

```sh
DEMO_VARIANT=improved npm run demo -- "Is sweet potato crème brûlée a Thanksgiving tradition?"
```

The baseline has two measured failure modes. Its stale tool documentation says to send `source_type="historical"`, while the backing service accepts `history` and `social`; the invalid value reaches runtime validation and can cause a corrective tool call. It also treats multiple high-engagement search hits as evidence of household popularity, although the result set is curated and non-representative. The improved variant uses the current enum and treats the social results as a selected sample. Tools read deterministic local fixtures; their lookup cost and latency are simulated. Model token usage, tool errors, and retries are captured in the shared AX trace. Four LLM judge evaluators and a code evaluator are defined in AX; the prompt sources are in [eval-prompts.json](data/eval-prompts.json).

## Demo material

- [Demo plan](DEMO_PLAN.md) describes the AX trace → eval → pass/fail dataset → experiment → Codex SDK story.
- [Dish benchmark](data/dish-benchmark.json) contains historical and synthetic lore cases plus sourced social-media examples. Expected answers are for evaluation; the live agent tools do not load these labels.

## Current boundary

The AX evaluator definitions and local query set are configured. An AX task still needs a chosen run mode (historical backfill, continuous, or both) before the evaluators will score project traces. Trace-derived datasets, experiment hill-climbing, and the autonomous Codex SDK loop remain later build steps in the talk plan.
