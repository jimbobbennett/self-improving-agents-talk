// Load tracing before the OpenAI Agents SDK is imported by run-agent.
import { flushTracing } from "./instrumentation.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { runPlanner, type DemoVariant } from "./run-agent.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
const publicDir = resolve(process.cwd(), "public");
const assetPath = resolve(process.cwd(), "output/imagegen/thanksgiving-food-stickers.png");
const projectName = process.env.ARIZE_PROJECT_NAME ?? "thanksgiving-food-lore-demo";
const projectId = process.env.ARIZE_PROJECT_ID ?? (projectName === "thanksgiving-food-lore-demo" ? "TW9kZWw6MTA5MTU1NjU1MTg6SG9Peg==" : undefined);
const organizationId = process.env.ARIZE_ORG_ID ?? "QWNjb3VudE9yZ2FuaXphdGlvbjozNzkyMTpiaFRG";
const mimeTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 16_000) throw new Error("Request is too large.");
  }
  return JSON.parse(body) as Record<string, unknown>;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/api/status") {
      response.writeHead(200, { "content-type": "application/json" });
      const now = Date.now();
      const projectUrl = projectId && process.env.ARIZE_SPACE_ID
        ? `https://app.arize.com/organizations/${organizationId}/spaces/${process.env.ARIZE_SPACE_ID}/projects/${projectId}?selectedTab=llmTracing&timeZoneA=America%2FLos_Angeles&startA=${now - 90 * 24 * 60 * 60 * 1000}&endA=${now}&envA=tracing&modelType=generative_llm`
        : undefined;
      response.end(JSON.stringify({ tracing: Boolean(process.env.ARIZE_API_KEY && process.env.ARIZE_SPACE_ID), project: projectName, projectUrl }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/dishes") {
      const file = await readFile(resolve(process.cwd(), "data/dish-benchmark.json"), "utf8");
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(file);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/plan") {
      const body = await readJsonBody(request);
      const input = typeof body.input === "string" ? body.input.trim() : "";
      const variant: DemoVariant = body.variant === "improved" ? "improved" : "baseline";
      if (!input) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Tell the planner what you want to know or plan." }));
        return;
      }
      const result = await runPlanner(input, variant);
      await flushTracing();
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(result));
      return;
    }
    let filePath: string;
    if (url.pathname === "/" || url.pathname === "/index.html") filePath = resolve(publicDir, "index.html");
    else if (url.pathname === "/assets/turkey-stickers.png") filePath = assetPath;
    else {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const content = await readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, host, () => console.log(`Thanksgiving planner listening at http://${host}:${port}`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(async () => { await flushTracing(); process.exit(0); }));
}
