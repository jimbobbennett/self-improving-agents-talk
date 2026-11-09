import { Codex } from "@openai/codex-sdk";
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { ensureEvaluatorAnnotationConfigs, exportDataset, uploadExperiment } from "./ax.js";
import { eligible, summarize } from "./metrics.js";
import { run } from "./process.js";
import { ratesForModel } from "./pricing.js";
import type { CandidateResult, DatasetExample, ExperimentRef, Metrics } from "./types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baselineSourcePatch = await run("git", ["diff", "HEAD", "--", "original/src"], { cwd: root });
const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const value = (flag: string, fallback: string) => argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1) ?? fallback;
const runEnabled = has("--run");
const full = has("--full");
const baselineOnly = has("--baseline-only");
const maxIterations = Number(value("--max-iterations", "1"));
const maxSpendUsd = Number(value("--max-spend-usd", process.env.IMPROVER_MAX_SPEND_USD ?? "0"));
const runId = new Date().toISOString().replace(/[:.]/g, "-");

if (!runEnabled) {
  console.log("Dry run: no model calls or AX writes. Use --run to start the bounded loop.");
  console.log("Full dataset scoring requires --full --confirm-full. Add --baseline-only to score the frozen dataset without candidates or a PR.");
  console.log("Defaults: one iteration, max 3 proposals.");
  console.log(`AX dataset: ${process.env.AX_DATASET_NAME ?? "thanksgiving-food-lore-traces-v1"}; AX space: ${process.env.ARIZE_SPACE ?? "jbennett Space"}`);
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for the Thanksgiving agent and evaluator calls.");
if (maxIterations < 1 || maxIterations > 5) throw new Error("--max-iterations must be between 1 and 5.");
if (!(maxSpendUsd > 0)) throw new Error("Set --max-spend-usd or IMPROVER_MAX_SPEND_USD to a positive spend ceiling.");
if (baselineOnly && !full) throw new Error("--baseline-only requires --full so the baseline always uses the complete frozen dataset.");
const appModel = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";
const judgeModel = process.env.IMPROVER_JUDGE_MODEL ?? appModel;
const appRates = ratesForModel(appModel, process.env.MODEL_INPUT_COST_PER_MILLION, process.env.MODEL_OUTPUT_COST_PER_MILLION);
const judgeRates = ratesForModel(judgeModel, process.env.JUDGE_INPUT_COST_PER_MILLION, process.env.JUDGE_OUTPUT_COST_PER_MILLION);
if (!appRates) throw new Error(`No verified USD token prices for app model ${appModel}; set MODEL_INPUT_COST_PER_MILLION and MODEL_OUTPUT_COST_PER_MILLION.`);
if (!judgeRates) throw new Error(`No verified USD token prices for judge model ${judgeModel}; set JUDGE_INPUT_COST_PER_MILLION and JUDGE_OUTPUT_COST_PER_MILLION.`);

const examples = await exportDataset();
const selected = full ? examples : examples.slice(0, Number(value("--max-examples", "5")));
if (!full && selected.length < 1) throw new Error("--max-examples must be positive.");
if (full && !has("--confirm-full")) throw new Error("Full dataset run not started. Review the projected workload and pass --confirm-full to proceed.");
await ensureEvaluatorAnnotationConfigs();
const candidateRuns = baselineOnly ? 0 : 3 * maxIterations;
const plannedAgentRuns = selected.length * (1 + candidateRuns);
const judgeCalls = plannedAgentRuns * 4;
const toolChecks = plannedAgentRuns;
console.log(`Planned workload: ${selected.length} examples, ${baselineOnly ? "baseline only" : `${maxIterations} iteration(s), up to 3 proposals/iteration`}; up to ${plannedAgentRuns} agent runs, ${judgeCalls} LLM judge calls, and ${toolChecks} local Tool Contract checks.`);
if (!baselineOnly) console.log("Codex SDK patch-generation turns are additionally billed or metered by the configured Codex account and are outside the token-cost estimate.");
console.log(`Spend ceiling: $${maxSpendUsd.toFixed(2)}. It is checked after each complete experiment batch, so one batch may cross it before the loop stops. Tool fixture cost fields are simulated and excluded.`);

const temporaryRoot = await mkdtemp(join(tmpdir(), "thanksgiving-improver-"));
const reportsDir = resolve(root, "reports", runId);
await mkdir(reportsDir, { recursive: true });
const codex = baselineOnly ? undefined : new Codex({ config: { sandbox_mode: "workspace-write" } });
const originalWorktree = join(temporaryRoot, "baseline");
const experimentRefs: ExperimentRef[] = [];
const iterations: Array<{ name: string; metrics: Metrics; experiment: ExperimentRef }> = [];
const candidateHistory: Array<{ iteration: number; label: string; parent: string; summary: string; metrics: Metrics; experiment: ExperimentRef; eligible: boolean; retainedAsParent: boolean; selectedAsBest: boolean; reasons: string[] }> = [];
let bestPatch = "";
let bestMetrics: Metrics | undefined;
let baselineMetrics: Metrics | undefined;
let bestResults: CandidateResult[] = [];
let totalCost = 0;
let stoppedBecause = baselineOnly ? "baseline-only run completed; candidate generation skipped" : "maximum iterations reached";
let initialBudgetStop: string | undefined;

async function createWorktree(path: string, patch?: string) {
  await run("git", ["worktree", "add", "--detach", path, "HEAD"], { cwd: root });
  // Include the current agent and runner source so the loop is usable before a commit is made.
  await cp(resolve(root, "original/src"), join(path, "original/src"), { recursive: true, force: true });
  await cp(resolve(root, "improver"), join(path, "improver"), { recursive: true, force: true, filter: (source) => !/(^|[\\/])node_modules([\\/]|$)/.test(source) && !/(^|[\\/])dist([\\/]|$)/.test(source) });
  await cp(resolve(root, "evals/eval-prompts.json"), join(path, "evals/eval-prompts.json"));
  // Stage the copied baseline so candidate diffs contain only Codex's proposed improvement.
  await run("git", ["add", "-f", "original/src"], { cwd: path });
  // Candidate worktrees use the installed app dependencies without copying env files.
  const appDependencies = existsSync(resolve(root, "original/node_modules")) ? resolve(root, "original/node_modules") : resolve(root, "node_modules");
  await run("ln", ["-s", resolve(root, "node_modules"), join(path, "node_modules")], { cwd: root });
  await run("ln", ["-s", appDependencies, join(path, "original/node_modules")], { cwd: root });
  await run("ln", ["-s", resolve(root, "improver/node_modules"), join(path, "improver/node_modules")], { cwd: root });
  await run("npm", ["run", "build", "--prefix", "original"], { cwd: path, timeoutMs: 120_000 });
  if (patch) await run("git", ["apply", "--whitespace=nowarn", "-"], { cwd: path, input: patch });
}

async function execute(worktree: string, label: string): Promise<{ results: CandidateResult[]; metrics: Metrics; experiment: ExperimentRef }> {
  const inputPath = join(temporaryRoot, "dataset.json");
  const resultPath = join(temporaryRoot, `${label}-results.json`);
  await writeFile(inputPath, JSON.stringify(selected));
  const script = join(worktree, "improver/src/candidate-runner.ts");
  await run("node", ["--import", resolve(root, "improver/node_modules/tsx/dist/loader.mjs"), script, inputPath, resultPath], { cwd: worktree, timeoutMs: 12 * 60 * 60_000 });
  const results = JSON.parse(await readFile(resultPath, "utf8")) as CandidateResult[];
  const metrics = summarize(results);
  const experiment = await uploadExperiment(`thanksgiving-${runId}-${label}`, selected, results);
  experimentRefs.push(experiment);
  return { results, metrics, experiment };
}

try {
  await createWorktree(originalWorktree);
  const baseline = await execute(originalWorktree, "baseline");
  baselineMetrics = bestMetrics = baseline.metrics;
  bestResults = baseline.results;
  totalCost += (baseline.metrics.meanCostUsd ?? 0) * baseline.metrics.examples;
  if (baseline.metrics.errors > 0) initialBudgetStop = `baseline had ${baseline.metrics.errors} failed examples; candidate comparison is not reliable`;
  if (baseline.metrics.meanCostUsd === undefined) initialBudgetStop = "baseline cost could not be measured; refusing to continue without complete token usage and model pricing";
  if (!initialBudgetStop && totalCost > maxSpendUsd) initialBudgetStop = `baseline reached $${totalCost.toFixed(4)}, above the $${maxSpendUsd.toFixed(2)} cap`;
  const projectedFirstIteration = totalCost + (baseline.metrics.meanCostUsd ?? 0) * baseline.metrics.examples * 3;
  if (!baselineOnly && !initialBudgetStop && projectedFirstIteration > maxSpendUsd) initialBudgetStop = `projected baseline-plus-candidate spend ($${projectedFirstIteration.toFixed(4)}) exceeds the $${maxSpendUsd.toFixed(2)} cap; no candidate run was started`;
  iterations.push({ name: "baseline", metrics: baseline.metrics, experiment: baseline.experiment });
  await rm(originalWorktree, { recursive: true, force: true });
  await run("git", ["worktree", "prune"], { cwd: root });

  if (initialBudgetStop) stoppedBecause = initialBudgetStop;
  let parents: Array<{ label: string; patch: string; results: CandidateResult[]; metrics: Metrics }> = [{ label: "baseline", patch: "", results: baseline.results, metrics: baseline.metrics }];
  for (let iteration = 1; !baselineOnly && !initialBudgetStop && iteration <= maxIterations; iteration++) {
    const proposals: Array<{ label: string; patch: string; parent?: string; summary?: string; worktree: string; results: CandidateResult[]; metrics: Metrics; experiment: ExperimentRef; gate: string[] }> = [];
    let budgetStopReason: string | undefined;
    const parentEvidence = parents.map((parent) => ({ label: parent.label, patch: parent.patch, metrics: parent.metrics, failingExamples: parent.results.filter((r) => Object.values(r.scores).some((s) => s.label === "fail")).slice(0, 20).map((r) => ({ input: r.input, answer: r.output, scores: r.scores, context: r.context })) }));
    const patchHashes = new Set<string>();
    for (let candidate = 1; candidate <= 3; candidate++) {
      const projectedCandidateSpend = totalCost + (bestMetrics!.meanCostUsd ?? 0) * selected.length;
      if (projectedCandidateSpend > maxSpendUsd) {
        budgetStopReason = `spend ceiling would be exceeded before candidate ${candidate} ($${projectedCandidateSpend.toFixed(4)} projected vs $${maxSpendUsd.toFixed(2)} cap)`;
        break;
      }
      const path = join(temporaryRoot, `i${iteration}-candidate${candidate}`);
      const parent = parents[(candidate - 1) % parents.length]!;
      await createWorktree(path, parent.patch || undefined);
      const statusBefore = new Set((await run("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: path })).split("\n").filter((line) => line.startsWith("?? ")).map((line) => line.slice(3)));
      const thread = codex!.startThread({ workingDirectory: path, threadSource: "thanksgiving-self-improver" });
      const proposal = await thread.run([
        "Improve this Thanksgiving agent based on the best two measured versions and their failures. Make exactly one small, distinct code change in original/src; do not edit dataset, evaluator, improver, or report files.",
        `Candidate ${candidate} of 3, iteration ${iteration}. This candidate starts from parent ${parent.label}; current best aggregate score: ${bestMetrics!.aggregateQuality}.`,
        `Top parent versions and their measured evidence: ${JSON.stringify(parentEvidence)}`,
        "Preserve behavior outside the target failure. Do not claim success; the evaluator will measure it. Make the code change directly in this worktree.",
        ].join("\n\n"));
      const changedPaths = (await run("git", ["diff", "--name-only"], { cwd: path })).trim().split("\n").filter(Boolean);
      const currentStatus = (await run("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: path })).split("\n").filter((line) => line.startsWith("?? ")).map((line) => line.slice(3));
      const newlyUntracked = currentStatus.filter((changedPath) => !statusBefore.has(changedPath));
      const outsidePaths = [...changedPaths, ...newlyUntracked].filter((changedPath) => !changedPath.startsWith("original/src/"));
      if (outsidePaths.length) {
        proposals.push({ label: `i${iteration}-candidate${candidate}`, patch: "", worktree: path, results: [], metrics: summarize([]), experiment: { name: "not-run" }, gate: [`Codex changed files outside original/src: ${outsidePaths.join(", ")}`, proposal.finalResponse] });
        continue;
      }
      await run("git", ["add", "-N", "original/src"], { cwd: path }).catch(() => undefined);
      const patch = await run("git", ["diff", "--", "original/src"], { cwd: path });
      if (!patch.trim()) {
        proposals.push({ label: `i${iteration}-candidate${candidate}`, patch: "", worktree: path, results: [], metrics: summarize([]), experiment: { name: "not-run" }, gate: ["Codex produced no app patch", proposal.finalResponse] });
        continue;
      }
      const hash = createHash("sha256").update(patch).digest("hex");
      if (patchHashes.has(hash)) {
        proposals.push({ label: `i${iteration}-candidate${candidate}`, patch: "", worktree: path, results: [], metrics: summarize([]), experiment: { name: "not-run" }, gate: ["Duplicate patch generated within this iteration", proposal.finalResponse] });
        continue;
      }
      patchHashes.add(hash);
      try {
        await run("npm", ["run", "build", "--prefix", "original"], { cwd: path, timeoutMs: 120_000 });
      } catch (error) {
        proposals.push({ label: `i${iteration}-candidate${candidate}`, patch, parent: parent.label, summary: proposal.finalResponse, worktree: path, results: [], metrics: summarize([]), experiment: { name: "not-run" }, gate: [`Candidate app did not compile: ${error instanceof Error ? error.message : String(error)}`] });
        continue;
      }
      const measured = await execute(path, `i${iteration}-candidate${candidate}`);
      const gate = eligible(measured.metrics, baselineMetrics!, bestMetrics!).reasons;
      totalCost += (measured.metrics.meanCostUsd ?? 0) * measured.metrics.examples;
      const actualSpendExceeded = totalCost > maxSpendUsd;
      if (actualSpendExceeded) {
        budgetStopReason = `measured spend reached $${totalCost.toFixed(4)}, above the $${maxSpendUsd.toFixed(2)} cap`;
        gate.push("actual spend cap exceeded");
      }
      proposals.push({ label: `i${iteration}-candidate${candidate}`, patch, parent: parent.label, summary: proposal.finalResponse, worktree: path, ...measured, gate });
      if (actualSpendExceeded) break;
    }
    const eligibleCandidates = proposals.filter((candidate) => candidate.patch && candidate.gate.length === 0).sort((a, b) => b.metrics.aggregateQuality - a.metrics.aggregateQuality || a.metrics.meanCostUsd! - b.metrics.meanCostUsd! || a.metrics.p95LatencyMs - b.metrics.p95LatencyMs);
    await writeFile(join(reportsDir, `iteration-${iteration}.json`), JSON.stringify(proposals.map(({ worktree: _w, ...rest }) => rest), null, 2));
    const nextParents = eligibleCandidates.slice(0, 2);
    for (const candidate of proposals) candidateHistory.push({ iteration, label: candidate.label, parent: candidate.parent ?? "unknown", summary: candidate.summary ?? candidate.gate.join("; "), metrics: candidate.metrics, experiment: candidate.experiment, eligible: eligibleCandidates.includes(candidate), retainedAsParent: nextParents.includes(candidate), selectedAsBest: candidate === eligibleCandidates[0], reasons: candidate.gate });
    if (!eligibleCandidates.length) { stoppedBecause = budgetStopReason ?? `iteration ${iteration} produced no eligible strict improvement`; break; }
    const previousBestScore = bestMetrics!.aggregateQuality;
    bestPatch = eligibleCandidates[0]!.patch;
    bestMetrics = eligibleCandidates[0]!.metrics;
    bestResults = eligibleCandidates[0]!.results;
    iterations.push({ name: eligibleCandidates[0]!.label, metrics: bestMetrics, experiment: eligibleCandidates[0]!.experiment });
    parents = eligibleCandidates.slice(0, 2).map((candidate) => ({ label: candidate.label, patch: candidate.patch, results: candidate.results, metrics: candidate.metrics }));
    // Clean isolated worktrees before the next generation round.
    for (const candidate of proposals) {
      await run("git", ["worktree", "remove", "--force", candidate.worktree], { cwd: root }).catch(() => undefined);
    }
    await run("git", ["worktree", "prune"], { cwd: root });
    if (budgetStopReason) {
      stoppedBecause = budgetStopReason;
      break;
    }
    if (bestMetrics.aggregateQuality <= previousBestScore) {
      stoppedBecause = `iteration ${iteration} produced no quality increase`;
      break;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    appModel,
    judgeModel,
    pricingUsdPerMillionTokens: {
      appInput: appRates.input,
      appOutput: appRates.output,
      judgeInput: judgeRates.input,
      judgeOutput: judgeRates.output,
      source: { app: appRates.source, judge: judgeRates.source },
    },
    dataset: process.env.AX_DATASET_NAME ?? "thanksgiving-food-lore-traces-v1",
    datasetVersion: process.env.AX_DATASET_VERSION ?? "RGF0YXNldFZlcnNpb246NDAyNjcxOi9FTzY=",
    evaluatorScoring: "Local judge calls using versioned eval-prompts.json rubrics plus a deterministic local Tool Contract check; results may be attached to AX experiment rows but are not AX evaluator task scores.",
    baseline: baselineMetrics,
    acceptedBest: bestMetrics,
    experiments: iterations,
    allExperiments: experimentRefs,
    candidateHistory,
    stopReason: stoppedBecause,
    totalEstimatedModelCostUsd: baselineMetrics.meanCostUsd === undefined ? null : totalCost,
    guardrails: { costAndP95LatencyMaxIncrease: "10% vs baseline and current best", maximumIterations: maxIterations },
  };
  await writeFile(join(reportsDir, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(join(reportsDir, "report.md"), renderReport(report));

  if (!full) {
    console.log(`Smoke run complete. Results are in ${reportsDir}; no candidate can be promoted and no PR is created from a partial dataset.`);
  } else if (baselineOnly) {
    console.log(`Baseline-only run complete. Results are in ${reportsDir}; candidate generation and PR creation were skipped.`);
  } else {
    if (!bestPatch.trim()) throw new Error("No candidate improved the baseline, so there is no fix to propose. Report artifacts are saved locally; no PR was created.");
    await createDraftPr(`${baselineSourcePatch}${bestPatch}`, runId);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined);
  await run("git", ["worktree", "prune"], { cwd: root }).catch(() => undefined);
}

function renderReport(report: { generatedAt: string; appModel: string; judgeModel: string; pricingUsdPerMillionTokens: Record<string, unknown>; dataset: string; datasetVersion: string; baseline?: Metrics; acceptedBest?: Metrics; experiments: Array<{ name: string; metrics: Metrics; experiment: ExperimentRef }>; candidateHistory: Array<{ iteration: number; label: string; parent: string; summary: string; metrics: Metrics; experiment: ExperimentRef; eligible: boolean; retainedAsParent: boolean; selectedAsBest: boolean; reasons: string[] }>; stopReason: string; totalEstimatedModelCostUsd: number | null; guardrails: unknown }): string {
  const table = report.experiments.map((row) => `| ${row.name} | ${row.metrics.aggregateQuality.toFixed(3)} | ${row.metrics.p95LatencyMs.toFixed(0)} | ${row.metrics.meanCostUsd === undefined ? "unknown" : `$${row.metrics.meanCostUsd.toFixed(5)}`} | ${row.experiment.id ?? row.experiment.name} |`).join("\n");
  const candidateRows = report.candidateHistory.map((row) => `| ${row.iteration} | ${row.label} | ${row.parent} | ${row.metrics.aggregateQuality.toFixed(3)} | ${Object.entries(row.metrics.quality).map(([name, metric]) => `${name}: ${metric.rate.toFixed(2)}`).join("; ")} | ${row.metrics.meanCostUsd === undefined ? "unknown" : `$${row.metrics.meanCostUsd.toFixed(5)}`} | ${row.metrics.p95LatencyMs.toFixed(0)} | ${row.selectedAsBest ? "best" : row.retainedAsParent ? "top-two parent" : row.eligible ? "eligible" : row.reasons.join("; ")} |`).join("\n");
  const summaries = report.candidateHistory.map((row) => `### Iteration ${row.iteration}: ${row.label}\n\nParent: ${row.parent}. ${row.selectedAsBest ? "Selected as the new best." : row.retainedAsParent ? "Retained in the top-two parent pool." : row.eligible ? "Passed metric gates." : `Rejected: ${row.reasons.join("; ")}`}\n\n${row.summary}\n`).join("\n");
  return `# Thanksgiving agent improvement report\n\nGenerated: ${report.generatedAt}\n\nApp model: ${report.appModel}; evaluator model: ${report.judgeModel}.\n\nDataset: ${report.dataset} (${report.datasetVersion})\n\n## Baseline and accepted versions\n\n| Version | Quality macro avg | p95 latency ms | Mean model cost/example | AX experiment |\n|---|---:|---:|---:|---|\n${table}\n\n## Candidate versions\n\n| Iteration | Candidate | Parent | Quality | Evaluator rates | Mean cost/example | p95 latency ms | Selection |\n|---:|---|---|---:|---|---:|---:|---|\n${candidateRows || "No candidate experiments were run."}\n\n## Candidate summaries\n\n${summaries || "No candidate proposals were generated."}\n\nThe JSON report and iteration files include proposal summaries, per-evaluator pass/fail counts, full outputs/evidence, AX experiment IDs, and rejection reasons.\n\n## Baseline evaluator pass rates\n\n${JSON.stringify(report.baseline?.quality, null, 2)}\n\n## Accepted best evaluator pass rates\n\n${JSON.stringify(report.acceptedBest?.quality, null, 2)}\n\n## Stop reason\n\n${report.stopReason}\n\nEstimated app and evaluator model cost total: ${report.totalEstimatedModelCostUsd === null ? "unknown" : `$${report.totalEstimatedModelCostUsd.toFixed(5)}`}. Rates per million tokens (USD): ${JSON.stringify(report.pricingUsdPerMillionTokens)}.\n\nCodex SDK patch-generation usage is metered separately and is not included. Search-tool fixture costs are simulated, not actual charges.\n\nGuardrails: ${JSON.stringify(report.guardrails)}\n\nEvaluation scores are computed locally from the versioned prompts and rules; any AX experiment annotations are copies of those local results, not AX evaluator task scores. Continuous trace-monitor tasks are not represented as having scored these experiment rows.\n`;
}

async function createDraftPr(patch: string, id: string) {
  const branch = `self-improving-agent/${id}`;
  const worktree = join(tmpdir(), `thanksgiving-pr-${id}`);
  await run("git", ["worktree", "add", "-b", branch, worktree, "main"], { cwd: root });
  try {
    await run("git", ["apply", "--whitespace=nowarn", "-"], { cwd: worktree, input: patch });
    await run("git", ["add", "original/src"], { cwd: worktree });
    const stagedPaths = (await run("git", ["diff", "--cached", "--name-only"], { cwd: worktree })).trim().split("\n").filter(Boolean);
    if (!stagedPaths.length || stagedPaths.some((path) => !path.startsWith("original/src/"))) {
      throw new Error(`Refusing to create a non-code PR; staged paths were: ${stagedPaths.join(", ") || "none"}`);
    }
    await run("git", ["commit", "-m", "Improve Thanksgiving agent from AX experiments"], { cwd: worktree });
    await run("git", ["push", "-u", "origin", branch], { cwd: worktree });
    const body = [
      "## Changes",
      "",
      "- Apply the selected Thanksgiving agent improvement in `original/src`.",
      "",
      "## Validation",
      "",
      "- The selected candidate passed the configured build and evaluation gates.",
    ].join("\n");
    await run("gh", ["pr", "create", "--draft", "--title", "Improve Thanksgiving agent", "--body", body], { cwd: worktree });
  } finally { await run("git", ["worktree", "remove", "--force", worktree], { cwd: root }).catch(() => undefined); }
}
