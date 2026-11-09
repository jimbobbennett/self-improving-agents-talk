export type DatasetExample = {
  id: string;
  input?: string;
  context?: unknown;
  output?: string;
  source_trace_id?: string;
  additional_properties?: Record<string, unknown>;
  [key: string]: unknown;
};

export type EvaluatorName = "factual_grounding" | "dish_classification" | "source_integrity" | "search_selection" | "tool_contract";
export type Label = "pass" | "fail" | "not_applicable";

export type EvaluatorScore = {
  label: Label;
  explanation: string;
  calls?: number;
  invalidCalls?: number;
  tokensIn?: number;
  tokensOut?: number;
};

export type CandidateResult = {
  exampleId: string;
  input: string;
  output: string;
  context: string;
  latencyMs: number;
  evaluationLatencyMs?: number;
  toolCalls: number;
  toolCallRecords?: Array<{ input: string; output?: string; error?: string }>;
  tokensIn?: number;
  tokensOut?: number;
  appTokensIn?: number;
  appTokensOut?: number;
  judgeTokensIn?: number;
  judgeTokensOut?: number;
  error?: string;
  scores: Record<EvaluatorName, EvaluatorScore>;
};

export type Metrics = {
  examples: number;
  quality: Record<EvaluatorName, { pass: number; fail: number; notApplicable: number; rate: number }>;
  aggregateQuality: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  meanCostUsd?: number;
  toolCalls: number;
  errors: number;
};

export type ExperimentRef = { name: string; id?: string; url?: string };
