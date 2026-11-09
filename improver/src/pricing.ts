export type ModelRates = { input: number; output: number; source: string };

// USD per million tokens, OpenAI API Standard pricing, short context.
// Rates were checked on 2026-11-06. Input is charged at the uncached rate,
// which is conservative because the current runner doesn't split cached tokens.
const verifiedRates: Record<string, ModelRates> = {
  "gpt-5.6-luna": {
    input: 0.2,
    output: 1.2,
    source: "https://developers.openai.com/api/docs/pricing (checked 2026-11-06)",
  },
};

export function ratesForModel(model: string, inputOverride?: string, outputOverride?: string): ModelRates | undefined {
  const base = verifiedRates[model.toLowerCase()];
  const input = inputOverride === undefined || inputOverride === "" ? base?.input : Number(inputOverride);
  const output = outputOverride === undefined || outputOverride === "" ? base?.output : Number(outputOverride);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input! < 0 || output! < 0) return undefined;
  return { input: input!, output: output!, source: base?.source ?? "environment override" };
}
