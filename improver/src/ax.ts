import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./process.js";
import type { CandidateResult, DatasetExample, ExperimentRef } from "./types.js";
import evaluatorConfig from "../../evals/ax-evaluators.json" with { type: "json" };

const space = process.env.ARIZE_SPACE ?? "jbennett Space";
const dataset = process.env.AX_DATASET_NAME ?? "thanksgiving-food-lore-traces-v1";
const versionId = process.env.AX_DATASET_VERSION ?? "RGF0YXNldFZlcnNpb246NDAyNjcxOi9FTzY=";

export async function ensureEvaluatorAnnotationConfigs(): Promise<void> {
  const listed = JSON.parse(await run("ax", ["annotation-configs", "list", "--space", space, "--name", "Thanksgiving", "-o", "json"])) as { annotation_configs?: Array<{ name: string }> };
  const existing = new Set((listed.annotation_configs ?? []).map((config) => config.name));
  for (const evaluator of Object.values(evaluatorConfig.evaluators)) {
    if (existing.has(evaluator.name)) continue;
    await run("ax", [
      "annotation-configs", "create", "categorical",
      "--name", evaluator.name,
      "--space", space,
      "--value", "pass",
      "--value", "fail",
      "-o", "json",
    ]);
  }
}

export async function exportDataset(): Promise<DatasetExample[]> {
  const stdout = await run("ax", ["datasets", "export", dataset, "--space", space, "--version-id", versionId, "--all", "--stdout"], { timeoutMs: 120_000 });
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((row) => !row || typeof row !== "object" || typeof row.id !== "string")) {
    throw new Error("AX dataset export was empty or missing top-level row IDs.");
  }
  return (parsed as Array<DatasetExample & { additional_properties?: Record<string, unknown> }>).map((row) => ({
    ...row.additional_properties,
    ...row,
    id: row.id,
  }));
}

export async function uploadExperiment(name: string, examples: DatasetExample[], results: CandidateResult[]): Promise<ExperimentRef> {
  const expected = new Set(examples.map((example) => example.id));
  const actual = results.map((result) => result.exampleId);
  if (actual.length !== expected.size || new Set(actual).size !== actual.length || actual.some((id) => !expected.has(id))) {
    throw new Error(`Experiment ${name} does not have exactly one result for each pinned AX dataset row.`);
  }
  await ensureEvaluatorAnnotationConfigs();
  const dir = await mkdtemp(join(tmpdir(), "thanksgiving-experiment-"));
  try {
    const runsPath = join(dir, "runs.json");
    const runInput = results.map((result) => ({ example_id: result.exampleId, output: result.output, metadata: { latency_ms: result.latencyMs, evaluator_latency_ms: result.evaluationLatencyMs, tool_calls: result.toolCalls, tool_call_records: result.toolCallRecords, tokens_in: result.tokensIn, tokens_out: result.tokensOut } }));
    await writeFile(runsPath, JSON.stringify(runInput, null, 2));
    const create = await run("ax", ["experiments", "create", "--name", name, "--dataset", dataset, "--space", space, "--file", runsPath, "-o", "json"]);
    const created = JSON.parse(create) as { id?: string; url?: string };
    const details = JSON.parse(await run("ax", ["experiments", "get", name, "--dataset", dataset, "--space", space, "-o", "json"])) as { dataset_version_id?: string };
    if (details.dataset_version_id && details.dataset_version_id !== versionId) {
      throw new Error(`AX attached ${name} to dataset version ${details.dataset_version_id}, but the runner used pinned version ${versionId}. Refusing to annotate a mismatched experiment.`);
    }
    const listed = JSON.parse(await run("ax", ["experiments", "list-runs", name, "--dataset", dataset, "--space", space, "--limit", String(Math.max(200, results.length)), "-o", "json"], { timeoutMs: 120_000 })) as { experiment_runs?: Array<{ id: string; example_id: string }> };
    const rows = listed.experiment_runs ?? [];
    if (rows.length !== results.length) throw new Error(`AX listed ${rows.length} runs for ${name}; expected ${results.length}. Refusing to attach incomplete annotations.`);
    const byExample = new Map(rows.map((row) => [row.example_id, row.id]));
    const annotations = results.map((result) => {
      const recordId = byExample.get(result.exampleId);
      if (!recordId) throw new Error(`AX experiment export has no run for dataset row ${result.exampleId}`);
      return { record_id: recordId, values: Object.entries(result.scores).filter(([, score]) => score.label !== "not_applicable").map(([key, score]) => ({ name: evaluatorConfig.evaluators[key as keyof typeof evaluatorConfig.evaluators].name, label: score.label, text: score.explanation })) };
    });
    const annotationPath = join(dir, "annotations.json");
    await writeFile(annotationPath, JSON.stringify(annotations, null, 2));
    await run("ax", ["experiments", "annotate-runs", name, "--dataset", dataset, "--space", space, "--file", annotationPath], { timeoutMs: 120_000 });
    const url = process.env.AX_EXPERIMENT_URL_TEMPLATE?.replaceAll("{id}", encodeURIComponent(created.id ?? name)).replaceAll("{name}", encodeURIComponent(name));
    return { name, id: created.id, url };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
