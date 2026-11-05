# Gobble & Tell: Thanksgiving Food Lore Chatbot

A demo for a self-improving Thanksgiving food-lore chatbot. It helps a British newcomer understand American dishes and social-media food trends, and separates documented modern traditions from claims about the 1621 gathering.

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
npm run demo -- "Is corn pudding a real Thanksgiving side everywhere, or is it more regional?"
```

Launch the local web UI with:

```sh
npm start
```

Then open `http://127.0.0.1:3000`. The page is a chat with playful turkey artwork, three real-world starter questions, and a link to the AX project. It runs the original agent only. Answers render headings, lists, emphasis, and source links. Evaluation results stay in AX rather than appearing as failure badges in the chat.

Run the eight-case local pass/fail query set sequentially with:

```sh
npm run benchmark
```

The list is in [eval-queries.json](data/eval-queries.json). Four cases use the improved variant as passing controls; four use the baseline to exercise the enum retry and search-selection checks. Each run emits an AX trace. Limit spend while iterating with `DEMO_BENCHMARK_LIMIT=1 npm run benchmark`.

Set `DEMO_VARIANT=improved` to run the improved prompt:

```sh
DEMO_VARIANT=improved npm run demo -- "Is sweet potato crème brûlée a Thanksgiving tradition?"
```

The demo covers two distinct failure types. First, the model chooses a free-form `source_type` value that the search service may reject, causing a corrective retry and another model call. The tool description intentionally leaves the string open-ended; the service accepts only `history` or `social`. Second, the model can overstate what curated sources establish—for example, inferring popularity from selected search results. AX has four LLM judge evaluators and a code evaluator for these behaviors. The tool-contract and search-selection checks continuously score new traces; factual-grounding, dish-classification, and source-integrity judges are available for targeted backfills. The prompt sources are in [eval-prompts.json](data/eval-prompts.json).

The original app snapshot is kept under [`orginal/`](orginal/) as the first layer of the talk repository.

## Demo material

- [Demo plan](DEMO_PLAN.md) describes the AX trace → eval → pass/fail dataset → experiment → Codex SDK story.
- [Dish benchmark](data/dish-benchmark.json) contains historical and synthetic lore cases plus sourced social-media examples. Expected answers are for evaluation; the live agent tools do not load these labels.

## Current boundary

The AX evaluators are attached to the Thanksgiving project. Tool-contract and search-selection evaluations run continuously; the other judge evaluators are attached to a one-time backfill task to limit ongoing cost. Trace-derived datasets, experiment hill-climbing, and the autonomous Codex SDK loop remain later build steps in the talk plan.
