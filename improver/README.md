## Thanksgiving self-improver

This is a separate TypeScript CLI using the official `@openai/codex-sdk` to propose app patches in isolated Git worktrees. Deterministic orchestration runs the existing Thanksgiving agent against AX dataset rows, scores each output with the versioned prompt rubrics in `../evals/eval-prompts.json`, applies the configured code rule for tool-contract errors, and creates versioned AX experiments with those scores attached as run annotations.

The continuous AX trace tasks are not run against experiment rows. Four LLM evaluators score each candidate response locally with their exact rubric prompts and their labels are uploaded to AX; the tool-contract evaluator checks each run's tool-call counters and annotates the query-level outcome. Candidate outputs and tool evidence are generated fresh; labels in the source dataset are only historical context.

### Setup

From the repository root:

```sh
npm install --prefix improver
npm run build --prefix improver
```

Prerequisites: Node 22+, the Codex CLI authenticated for the `@openai/codex-sdk`, the project's normal OpenAI and Arize environment variables, `ax` CLI authenticated to `jbennett Space`, and `gh` authenticated for draft PR creation.

Provide current price rates as USD per million tokens. `MODEL_*` rates must match `OPENAI_MODEL`. If `IMPROVER_JUDGE_MODEL` differs from the app model, also set `JUDGE_*` rates. Evaluator token usage is included in candidate cost. Codex SDK turn cost is separately billed/metered by the Codex account and is outside this estimate. The dish search tool's external-cost field is simulated and excluded from monetary claims.

### Run

No flags means a dry-run and makes no API calls. Start a five-row smoke run with a spend ceiling:

```sh
npm run improve --prefix improver -- --run --max-examples=5 --max-iterations=1 --max-spend-usd=1
```

Smoke runs create local reports only; they cannot promote a fix or create a PR. Full selection runs the complete frozen dataset and require a separate explicit flag:

```sh
npm run improve --prefix improver -- --run --full --confirm-full --max-iterations=1 --max-spend-usd=10
```

To measure the full baseline without generating candidates or creating a PR:

```sh
npm run improve --prefix improver -- --run --full --confirm-full --baseline-only --max-spend-usd=0.50
```

Choose the spend ceiling for your own account. It is checked after each complete experiment batch; one batch may cross the ceiling before the loop stops. Baseline-only mode runs one fresh app request and four local judge calls per example, then uploads the results and labels to one AX experiment.

The default is one iteration with three candidates. A full run calls the app once for the baseline, once per candidate, and four LLM evaluators for every output. Review the printed call estimate and set a spend cap appropriate for your model before running.

AX settings: `ARIZE_SPACE` (default `jbennett Space`), `AX_DATASET_NAME` (default `thanksgiving-food-lore-traces-v1`), and optional `AX_DATASET_VERSION` for report metadata. After a full run selects a candidate, the runner opens a draft PR containing only staged changes under `original/src`. The PR body is a short code-focused summary; reports, experiment data, and screenshots remain local and are not added or linked.

Reports and per-iteration JSON are written to `reports/<run-id>/`. The metric gate tolerates up to one example fewer passing per evaluator versus current best, requires a macro-average improvement larger than one evaluator label on one example, and keeps both mean model cost and p95 latency no more than 110% of baseline and current best. Tool-contract pass rate is reported separately and uses applicable runs only. Failed or timed-out rows count as failures; missing price/usage data blocks acceptance. The local judge model does not support temperature control, so borderline labels can vary; local scores are compared between fresh candidates and are not assumed to reproduce historical AX labels exactly.
