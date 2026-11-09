import { tool } from "@openai/agents";
import { z } from "zod";
import benchmark from "../../data/dish-benchmark.json" with { type: "json" };

type EvidenceItem = {
  id: string;
  name: string;
  platform?: string;
  creator?: string;
  note: string;
  sources: string[];
};

const socialEvidence: EvidenceItem[] = benchmark.viral_social_candidates.map((item) => ({
  id: item.id,
  name: item.candidate_name,
  platform: item.platform,
  creator: "creator" in item ? item.creator : undefined,
  note: `${item.reported_as} ${item.what_makes_it_unusual} ${item.classification}`,
  sources: item.source_urls,
}));

const historicalEvidence: EvidenceItem[] = [
  {
    id: "green-bean-casserole",
    name: "green bean casserole",
    note: "A real twentieth-century dish created in a Campbell's test kitchen; it was not served at the 1621 gathering.",
    sources: [
      "https://www.smithsonianmag.com/history/what-food-was-served-at-the-first-thanksgiving-in-1621-511554/",
      "https://americanhistory.si.edu/explore/stories/5-questions-colonial-culinarian",
    ],
  },
  {
    id: "sweet-potato-casserole",
    name: "sweet potato casserole with marshmallows",
    note: "A real modern recipe with a marshmallow-topped version documented in the early twentieth century; it is not evidence of a universal custom or a 1621 dish.",
    sources: [
      "https://www.smithsonianmag.com/smart-news/happy-100-birthday-marshmallow-sweet-potato-180967245/",
      "https://americanhistory.si.edu/explore/stories/5-questions-colonial-culinarian",
    ],
  },
  {
    id: "corn-pudding",
    name: "corn pudding",
    note: "A real dish served at Thanksgiving in some regions and households; modern corn pudding should not be projected onto the 1621 menu just because corn was present.",
    sources: [
      "https://www.marthastewart.com/1155558/corn-pudding-chives",
      "https://fns-prod.azureedge.us/americasharvest/founding/sides/corn-pudding",
    ],
  },
  {
    id: "pumpkin-pie",
    name: "pumpkin pie",
    note: "A common modern Thanksgiving dessert; the Smithsonian says there was no pie at the 1621 harvest gathering.",
    sources: [
      "https://americanhistory.si.edu/explore/stories/5-questions-colonial-culinarian",
      "https://www.si.edu/spotlight/thanksgiving/thanksgiving-foods",
    ],
  },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type DemoMetrics = {
  searchToolCalls: number;
  invalidSourceTypeCalls: number;
  completedSearches: number;
  searchEvidence: string[];
  toolCallRecords: Array<{ input: string; output?: string; error?: string }>;
};

const validSourceTypes = ["history", "social"] as const;

function matchRecords<T>(query: string, records: T[], matcher: (record: T) => string): T[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  return records.filter((record) => words.some((word) => matcher(record).toLowerCase().includes(word))).slice(0, 3);
}

async function mockSearch<T>(args: {
  sourceType: "history" | "social";
  query: string;
  records: T[];
  matcher: (record: T) => string;
}) {
  const started = Date.now();
  await wait(120);
  const results = matchRecords(args.query, args.records, args.matcher);
  return {
    source_type: args.sourceType,
    query: args.query,
    results,
    search_scope: args.sourceType === "social"
      ? "Curated high-engagement posts and coverage; this is not a representative sample of households."
      : "Curated dish-history references; results do not estimate household prevalence.",
    telemetry: {
      latency_ms: Date.now() - started,
      estimated_external_cost_usd: 0.002,
      cost_is_simulated: true,
    },
  };
}

const menuItems = [
  { name: "roast turkey", course: "main", dietaryFlags: ["meat"], ovenMinutes: 210 },
  { name: "cornbread dressing", course: "side", dietaryFlags: ["gluten", "dairy"], ovenMinutes: 45 },
  { name: "green bean casserole", course: "side", dietaryFlags: ["dairy", "gluten"], ovenMinutes: 35 },
  { name: "cranberry sauce", course: "side", dietaryFlags: ["none"], ovenMinutes: 0 },
  { name: "sweet potato casserole with marshmallows", course: "side", dietaryFlags: ["dairy", "gelatin may be present"], ovenMinutes: 30 },
  { name: "pumpkin pie", course: "dessert", dietaryFlags: ["gluten", "dairy", "egg"], ovenMinutes: 55 },
];

export function createTools(metrics: DemoMetrics) {
  const searchFoodLore = tool({
    name: "search_food_lore",
    description: "Search Thanksgiving food references. Optionally describe the kind of source to search for in source_type. Social results are ranked by engagement.",
    // The public contract is a string, while the backing service validates an enum.
    // This models API documentation/schema drift found in real tool integrations.
    parameters: z.object({ query: z.string().min(2), source_type: z.string().optional() }),
    execute: async ({ query, source_type }) => {
      metrics.searchToolCalls++;
      const record: { input: string; output?: string; error?: string } = { input: JSON.stringify({ query, source_type }) };
      metrics.toolCallRecords.push(record);
      if (source_type !== undefined && !validSourceTypes.includes(source_type as typeof validSourceTypes[number])) {
        metrics.invalidSourceTypeCalls++;
        record.error = `Invalid source_type '${source_type}'. The service accepts 'history' or 'social'.`;
        throw new Error(record.error);
      }
      const sourceType = (source_type ?? "history") as "history" | "social";
      metrics.completedSearches++;
      const result = await mockSearch({
        sourceType,
        query,
        records: sourceType === "social" ? socialEvidence : historicalEvidence,
        matcher: (item) => item.name,
      });
      const serialized = JSON.stringify(result);
      metrics.searchEvidence.push(serialized);
      record.output = serialized;
      return serialized;
    },
    errorFunction: async (_context, error) => `Search request rejected: ${error instanceof Error ? error.message : String(error)} Retry with one of the accepted source_type values.`,
  });

  const suggestMenu = tool({
    name: "suggest_menu",
    description: "Suggest a Thanksgiving menu from the demo catalog for the requested guest count and dietary exclusions. Do not claim the menu is universal.",
    parameters: z.object({ guest_count: z.number().int().min(1).max(40), dietary_exclusions: z.array(z.string()) }),
    execute: async ({ guest_count, dietary_exclusions }) => {
      const started = Date.now();
      await wait(150);
      const excluded = new Set(dietary_exclusions.map((value) => value.toLowerCase()));
      const selected = menuItems.filter((item) => !item.dietaryFlags.some((flag) => excluded.has(flag)));
      return JSON.stringify({
        guest_count,
        menu: selected,
        note: "Ingredient flags are demo metadata; verify package labels and family recipes before serving guests.",
        telemetry: {
          latency_ms: Date.now() - started,
          estimated_external_cost_usd: 0.001,
          cost_is_simulated: true,
        },
      });
    },
  });

  return [searchFoodLore, suggestMenu];
}
