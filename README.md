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
cd original
npm install
npm run build
npm run demo -- "Is corn pudding a real Thanksgiving side everywhere, or is it more regional?"
```

Launch the local web UI with:

```sh
cd original
npm start
```

Then open `http://127.0.0.1:3000`. The page is a chat with playful turkey artwork, three real-world starter questions, and a link to the AX project. It runs the original agent only. Answers render headings, lists, emphasis, and source links. Evaluation results stay in AX rather than appearing as failure badges in the chat.

Run the eight-case local pass/fail query set sequentially with:

```sh
cd original
npm run benchmark
```

The list is in [eval-queries.json](evals/eval-queries.json). Four cases use the improved variant as passing controls; four use the baseline to exercise the enum retry and search-selection checks. Each run emits an AX trace. Limit spend while iterating with `DEMO_BENCHMARK_LIMIT=1 npm run benchmark`.

Set `DEMO_VARIANT=improved` to run the improved prompt:

```sh
cd original
DEMO_VARIANT=improved npm run demo -- "Is sweet potato crème brûlée a Thanksgiving tradition?"
```

The demo covers two distinct failure types. First, the model chooses a free-form `source_type` value that the search service may reject, causing a corrective retry and another model call. The tool description intentionally leaves the string open-ended; the service accepts only `history` or `social`. Second, the model can overstate what curated sources establish—for example, inferring popularity from selected search results. AX has four LLM judge evaluators and a code evaluator for these behaviors. The tool-contract and search-selection checks continuously score new traces; factual-grounding, dish-classification, and source-integrity judges are available for targeted backfills. The prompt sources are in [eval-prompts.json](evals/eval-prompts.json).

The runnable original app is in [`original/`](original/) as the first layer of the talk repository.

## Demo material

- [Demo plan](DEMO_PLAN.md) describes the AX trace → eval → pass/fail dataset → experiment → Codex SDK story.
- [Search fixture](data/dish-benchmark.json) contains the historical and social-media evidence the live tool uses. Evaluation materials live in [evals/](evals/).

## Self-improving agent loop

The Codex SDK experiment runner lives in [`improver/`](improver/); its design and reviewer feedback are recorded in [SELF_IMPROVING_AGENT_PLAN.md](SELF_IMPROVING_AGENT_PLAN.md). Install its separate dependencies with `npm install --prefix improver`.

The runner starts in dry-run mode. A five-example smoke run (no promotion or PR) can be started with:

```sh
npm run build --prefix improver
npm run improve --prefix improver -- --run --max-examples=5 --max-iterations=1 --max-spend-usd=1
```

For full dataset selection and draft PR creation, add `--full --confirm-full`. Set `MODEL_INPUT_COST_PER_MILLION` and `MODEL_OUTPUT_COST_PER_MILLION` to the app model's current rates; when the judge model differs, also set `JUDGE_INPUT_COST_PER_MILLION` and `JUDGE_OUTPUT_COST_PER_MILLION`. These rates are required to pass cost guardrails. The tool fixture's external-cost field is simulated and excluded from monetary claims. Codex SDK turn cost is separately metered by the configured Codex account and is not included in app/evaluator token-cost totals.

The full run also needs the existing AX CLI profile and dataset access, GitHub CLI authentication, and an authenticated Chromium session exposed via `AX_CHROME_CDP_URL`. Set `AX_EXPERIMENT_URL_TEMPLATE` to the AX experiment URL pattern used to capture the best experiment screenshot, with `{id}` or `{name}` as a placeholder. The PR flow stops if it cannot capture that screenshot. Full runs score every row with four versioned judge prompts plus tool-contract checks, so choose an explicit spend cap carefully.

## Current boundary

The AX evaluators are attached to the Thanksgiving project. Tool-contract and search-selection evaluations run continuously; the other judge evaluators are attached to a one-time backfill task to limit ongoing cost. Candidate experiments are scored with the same versioned evaluator prompts and the code tool-contract rule, then attached to AX experiment runs as annotations. The continuous trace tasks are not represented as having scored those experiment rows.
