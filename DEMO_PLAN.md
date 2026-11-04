# Thanksgiving Food Lore Planner: Self-Improving Agent Demo

## Demo objective

Show a deliberately flawed Thanksgiving dinner planner, use Arize AX traces and evaluations to discover repeatable failures, turn real passing and failing traces into a dataset, improve quality and cost through measured iterations, then automate the improvement workflow with the Codex SDK.

## Product concept

The Thanksgiving Food Lore Planner helps a British newcomer understand dishes and trends, distinguish real foods from fabricated social-media bait, and then build a menu for a group. It asks about guest count, dietary restrictions, oven capacity, and preferences before returning a menu, ingredient list, and feasible cooking timeline. Its playful voice can gently tease dishes such as marshmallow-topped sweet potatoes without mocking guests or treating one regional tradition as universal.

### Research agent

The planner delegates dish and trend questions to a research agent. It searches for the dish, checks the historical and cultural claims, and looks for the original TikTok or Instagram post when the dish is a social-media trend. It returns structured evidence to the planner:

- Canonical dish name and a short, plain-language description.
- Whether the dish is documented, a regional/family tradition, a modern trend, a synthetic benchmark example, or simply unverified. Lack of a search result must not be treated as proof that a dish is fake.
- Creator, platform, post date, and a direct post/video URL when verified. Never invent a social URL; return a source article link or no video link if the original post cannot be verified.
- A brief explanation of what makes the recipe notable, and whether it is known as a Thanksgiving dish or merely went viral around the holiday.
- Source URLs and a confidence/evidence note for claims about popularity or the 1621 gathering.

The baseline's seeded defect is stale tool documentation: it exposes an optional `source_type` as a plain string and uses the value `historical`, while the backing service validates the enum `history | social`. The model follows the documented value, gets a runtime validation error, and spends another model turn correcting the call. The improved agent uses the runtime enum. The tool-contract code evaluator catches invalid values. The search-selection judge is a guardrail for a realistic risk: the social endpoint returns a curated high-engagement sample that cannot establish household prevalence. AX traces show the failed call, retry, result scope, and token cost.

### UI direction

Keep the landing page focused on the planner and use playful sample prompts for real dishes, viral recipes, and synthetic benchmark names. In the answer, show research results in a compact playful card when useful; include the dish name, short description, evidence labels, and a **Watch original on TikTok/Instagram** link only when the direct post is verified. Include creator and post date when known. Make source links available beside historical claims.

Use a warm, silly illustration style: expressive turkey characters, anthropomorphic Thanksgiving sides, rounded shapes, and a hand-drawn cut-paper/sticker feel on a warm cream canvas. Keep the humor affectionate and legible at small card sizes. The first generated art-direction sheet is [thanksgiving-food-stickers.png](output/imagegen/thanksgiving-food-stickers.png); it shows a chef turkey, a turkey hiding behind gravy, marshmallow-topped sweet potatoes, a skeptical cranberry bowl, and a cheerful corn cob.

For synthetic benchmark dishes, show a light-hearted **Made up for this demo** verdict. For any other dish with insufficient evidence, use **Couldn’t verify this one yet** rather than declaring it fake. Keep viral popularity claims specific to the evidence and date; do not turn a viral post into a claim that everyone serves the dish. The sweet-potato-and-marshmallow joke belongs in the copy, not as a judgment of the person who likes it.

## Baseline agent

The current seeded failure is stale tool-contract documentation: the prompt and tool description use `source_type="historical"`, while the service validates `history | social`. The agent gets a model-visible validation error, retries, and incurs an unnecessary model turn before recovering. The evaluator catches the invalid call count; AX shows the rejected input, returned validation message, corrective call, and added model span.

Additional realistic failure cases to add as the planner grows:

- Social search results overrepresent unusual viral recipes, leading the planner to overstate how common they are.
- A recipe record is missing an allergen field, so a menu passes a simplistic ingredient filter but violates a guest's restriction.
- Oven capacity is treated as one slot even when the plan schedules overlapping dishes, or prep time is confused with bake time.
- A recipe's base serving count is missing or misread, so quantities are scaled for the wrong number of guests.
- Coverage articles are mistaken for original creator posts, or an unavailable original link is presented as verified.

Use deterministic mock tools first so the demo does not depend on paid recipe APIs or unstable search results. Give each mock tool realistic latency and token/cost metadata, and emit span attributes for tool name, request key, cache hit, and result count. This preserves the visible cost story while keeping runs repeatable.

## Tool set

1. `search_recipes`: return candidate dishes by course and preference.
2. `check_ingredients`: identify allergens and dietary conflicts.
3. `scale_servings`: calculate quantities from a recipe's base servings.
4. `schedule_oven`: find conflicts across temperature, duration, and oven capacity.

For later experiments, the baseline can call each planner tool independently for every candidate. An improved version can batch ingredient checks, deduplicate genuine repeated lookups, and schedule only shortlisted dishes.

## Trace and evaluation plan

Trace each request and tool span with a run ID, prompt/version label, tool inputs and outputs, elapsed time, token usage, estimated cost, and cache/deduplication status. Keep secrets and unnecessary personal data out of traces.

Start with evaluators tied to observable failure modes:

- **Dietary constraints (code):** no selected dish contains a forbidden ingredient.
- **Schedule feasibility (code):** no overlapping use exceeds oven capacity and timing is internally consistent.
- **Serving accuracy (code):** quantities scale to the requested guest count within a defined tolerance.
- **Tool efficiency (code):** count duplicate calls and total calls; report cost and latency alongside the score.
- **Cultural grounding and tone (judge):** distinguish common traditions from regional or social-media trends, and keep teasing light rather than judgmental.
- **Research evidence (code/judge):** direct post links resolve to the named creator/platform when available; claims about a dish, virality, or history are supported by returned sources; uncertainty is preserved when evidence is thin.
- **UI evidence integrity (code):** synthetic benchmark names are distinguished from merely unverified dishes, and no fabricated video URL is rendered.

Do not optimize only for fewer calls: require quality gates for dietary safety and schedule feasibility, then compare cost and tool-call count among candidates that pass those gates.

## AX improvement loop

1. Generate a small set of representative planner runs and inspect their traces.
2. Run the code and judge evaluators on traces; inspect failure labels and explanations.
3. Build a versioned dataset containing both failing traces and successful counterexamples. Preserve the original user request, relevant tool results, expected constraints, failure category, and source trace ID.
4. Change one thing at a time (prompt, tool routing, batching, or caching).
5. Run baseline and candidate experiments against the same dataset with the same evaluators.
6. Keep an iteration only if it passes hard quality gates and improves the chosen cost/quality objective; add newly discovered regressions to the dataset.

## Talk narrative

1. Show the baseline recover from the stale source enum after an avoidable model turn.
2. Open its AX trace and compare the rejected tool call, validation feedback, corrected call, and token cost with the improved run.
3. Create a pass/fail dataset from those traces and identify the failure categories.
4. Ask a coding agent with Arize AX skills to propose and measure a change.
5. Compare factual distinctions, planning quality, and cost before/after in an experiment.
6. Run the repeatable trace-to-dataset-to-experiment workflow through the Codex SDK as the final autonomous agent.
7. Ask about a strange dish and show the research agent's trace, then render its verified TikTok/Instagram source as a clickable dish card.

## Build sequence

1. Create a minimal deterministic planner, research agent, and mock search/tool environment.
2. Add trace export/observability and seed trace examples, including verified source URLs and intentionally unverified/synthetic examples.
3. Build a UI that renders structured research results as playful dish cards with direct social-video links only when verified. **Initial local UI implemented:** generated turkey art, sample prompts, baseline/improved planner switch, AX project link, and the tool-contract check.
4. Connect to an Arize AX project, configure evaluators, and exercise the AX skills workflow.
5. Tune the planner and research workflow against the pass/fail dataset and report quality/cost deltas.
6. Wrap the repeatable improvement workflow in a Codex SDK application, with bounded iterations and a human-readable change report.

## Completion evidence

- A baseline run produces spans for model and tool activity in AX.
- At least one seeded defect is caught by an evaluator.
- The dataset contains both passing and failing cases derived from traces.
- A candidate experiment improves the measured objective without violating quality gates.
- Research results include accurate dish context and working direct post links where a source can be verified; missing links are not fabricated.
- The UI clearly distinguishes verified real dishes, synthetic benchmark names, and dishes that remain unverified.
- The Codex SDK workflow can repeat the analysis and return an inspectable result.
