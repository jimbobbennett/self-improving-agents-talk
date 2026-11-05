# Gobble & Tell: Self-Improving Thanksgiving Chatbot Demo

## Demo objective

Show a playful Thanksgiving Q&A chatbot for a British newcomer, use Arize AX traces and evaluations to find realistic cost and answer-quality failures, turn passing and failing traces into a dataset, improve the agent through measured iterations, then automate the improvement workflow with the Codex SDK.

## Product concept

The Thanksgiving Food Lore chatbot answers questions a British newcomer might ask about American dishes, regional traditions, social-media recipes, and the first Thanksgiving. It can gently tease dishes such as marshmallow-topped sweet potatoes without mocking the people who enjoy them or treating one regional tradition as universal. Keep the product focused on conversation and researched answers; menu planning is outside the current demo scope.

### Research behavior

The current app is one agent with a `search_food_lore` tool; it is not yet a separate research-agent orchestration. The desired research behavior is to search for the dish, check historical and cultural claims, and look for the original TikTok or Instagram post when the dish is a social-media trend. Keep evidence explicit in the trace and answer:

- Canonical dish name and a short, plain-language description.
- Whether the dish is documented, a regional/family tradition, a modern trend, a synthetic benchmark example, or simply unverified. Lack of a search result must not be treated as proof that a dish is fake.
- Creator, platform, post date, and a direct post/video URL when verified. Never invent a social URL; return a source article link or no video link if the original post cannot be verified.
- A brief explanation of what makes the recipe notable, and whether it is known as a Thanksgiving dish or merely went viral around the holiday.
- Source URLs and a confidence/evidence note for claims about popularity or the 1621 gathering.

The tool-call issue models an integration failure: the tool accepts `source_type` as a string, and its neutral description asks the model to choose a suitable source type. The backing service accepts only `history | social`, so a model guess such as `historical` gets rejected and may cost another model turn to correct. This is now a natural but probabilistic failure, not a hard-coded instruction. A deterministic AX code evaluator catches invalid tool input. Separately, the model can make ordinary evidence errors, such as inferring how common a food is from curated search results. AX judge evaluators catch these answer-quality issues.

### UI direction

Keep the app a simple chat for Thanksgiving questions. It needs the conversation, playful turkey artwork, a link to the AX project, and readable answers with source links. Do not show evaluation labels, error counts, retry counts, or other failure indicators in the chat; use AX to inspect those. Provide three real-world starter questions and use the original agent for each: one clean control, one tool-contract retry, and one search-selection failure.

Use a warm, silly illustration style: expressive turkey characters, anthropomorphic Thanksgiving sides, rounded shapes, and a hand-drawn cut-paper/sticker feel on a warm cream canvas. Keep the humor affectionate and legible at small card sizes. The first generated art-direction sheet is [thanksgiving-food-stickers.png](output/imagegen/thanksgiving-food-stickers.png); it shows a chef turkey, a turkey hiding behind gravy, marshmallow-topped sweet potatoes, a skeptical cranberry bowl, and a cheerful corn cob.

Keep viral popularity claims specific to the evidence and date; do not turn a viral post into a claim that everyone serves the dish. The sweet-potato-and-marshmallow joke belongs in the copy, not as a judgment of the person who likes it.

## Baseline agent

The seeded integration issue is an open-ended tool parameter: the description accepts any string and tells the agent to choose a source type, while the service validates only `history | social`. The Original agent may guess `historical`, get a model-visible validation error, retry, and incur an extra model turn. The tool evaluator catches the rejected argument; AX shows the invalid call and correction. This cost example is probabilistic rather than guaranteed.

The natural quality failures come from the model filling gaps in incomplete evidence. The green bean casserole question can prompt the agent to add broad popularity claims even though its curated history sources do not estimate prevalence. Related traces also show the model adding an exact date or creator not contained in those sources. Search-selection, factual-grounding, and source-integrity judges flag these claims without injecting false records into the answer.

Other realistic failure cases to consider later:

- Social search results overrepresent unusual viral recipes, leading the planner to overstate how common they are.
- A social roundup is mistaken for the creator's original post, or an unavailable original link is presented as verified.
- A plausible dish with no matching source is confidently described as a longstanding tradition instead of being marked unverified.
- A source confirms a dish exists but says nothing about its date, creator, or popularity; the answer supplies those missing details anyway.

Use deterministic local search fixtures so the demo does not depend on paid recipe APIs or unstable search results. Preserve each result's source scope, links, and simulated latency/cost in trace context. This keeps the demo repeatable while the extra model turn from an invalid search argument makes cost visible in AX.

## Tool set

1. `search_food_lore`: retrieve curated historical or social-media evidence for a dish.
2. `suggest_menu`: return a small demo menu if the conversation asks for one; menu planning is not a focus of the talk.

For later experiments, cost improvements can reduce redundant lookups, stop once evidence is sufficient, and avoid calling both search modes when the question only needs one.

## Trace and evaluation plan

Trace each request and tool span with a run ID, prompt/version label, tool inputs and outputs, elapsed time, token usage, estimated cost, and cache/deduplication status. Keep secrets and unnecessary personal data out of traces.

The AX project has five evaluators tied to observed issues:

- **Tool contract (code):** fails when a tool span sends the unsupported `historical` source value; the corrected `history` or `social` call passes.
- **Search selection bias (judge):** fails when the agent infers household prevalence from a curated, high-engagement result set.
- **Factual grounding (judge):** fails when factual or historical claims exceed the retrieved evidence.
- **Dish classification (judge):** checks distinctions among documented dishes, regional customs, social-media recipes, synthetic names, and unverified claims.
- **Source integrity (judge):** checks that creator, platform, date, and source-link claims match the trace evidence.

The tool-contract and search-selection evaluators run continuously on new traces. The other judges are attached to the manual backfill task to control ongoing judge cost.

Do not optimize only for fewer calls: preserve factual grounding and source integrity while reducing avoidable model turns, latency, and cost.

## AX improvement loop

1. Generate a small set of representative planner runs and inspect their traces.
2. Run the code and judge evaluators on traces; inspect failure labels and explanations.
3. Build a versioned dataset containing both failing traces and successful counterexamples. Preserve the original user request, relevant tool results, expected constraints, failure category, and source trace ID.
4. Change one thing at a time (prompt, tool routing, batching, or caching).
5. Run baseline and candidate experiments against the same dataset with the same evaluators.
6. Keep an iteration only if it passes hard quality gates and improves the chosen cost/quality objective; add newly discovered regressions to the dataset.

## Talk narrative

1. Ask for the sweet potato crème brûlée recipe from @eatsbyrachel and a link to the original post. This avoids a prevalence question and is the clean control.
2. Ask whether corn pudding is a Thanksgiving side everywhere. Inspect any invalid source-type guess and corrective retry in AX.
3. Ask when green bean casserole was created and whether it was served at the 1621 gathering. Inspect the search-selection failure if the answer makes an unsupported popularity claim.
4. Create a pass/fail dataset from those traces and identify the distinct failure categories.
5. Ask a coding agent with Arize AX skills to propose and measure a change.
6. Compare answer quality and cost before/after in an experiment.
7. Run the repeatable trace-to-dataset-to-experiment workflow through the Codex SDK as the final autonomous agent.

## Build sequence

1. Create a deterministic food-lore agent, search tool, and local evidence fixtures.
2. Add trace export/observability and seed trace examples, including verified source URLs and intentionally unverified/synthetic examples.
3. Build a simple chat UI with fun art, readable Markdown/source links, and an AX project link. **Implemented:** generated turkey art, three real-world starter prompts, original agent only, and no visible evaluation badges.
4. Connect to an Arize AX project, configure evaluators, and exercise the AX skills workflow.
5. Tune the planner and research workflow against the pass/fail dataset and report quality/cost deltas.
6. Wrap the repeatable improvement workflow in a Codex SDK application, with bounded iterations and a human-readable change report.

## Completion evidence

- A baseline run produces spans for model and tool activity in AX.
- At least one seeded defect is caught by an evaluator.
- The dataset contains both passing and failing cases derived from traces.
- A candidate experiment improves the measured objective without violating quality gates.
- Research results include accurate dish context and working direct post links where a source can be verified; missing links are not fabricated.
- The UI renders agent answers and source links; evaluator results remain in AX.
- The Codex SDK workflow can repeat the analysis and return an inspectable result.
