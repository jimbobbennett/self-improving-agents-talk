import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { OpenAIAgentsInstrumentation } from "@arizeai/openinference-instrumentation-openai-agents";
import * as agents from "@openai/agents";

const projectName = process.env.ARIZE_PROJECT_NAME ?? "thanksgiving-food-lore-demo";
const credentials = ["ARIZE_SPACE_ID", "ARIZE_API_KEY"] as const;
const missing = credentials.filter((key) => !process.env[key]);

let provider: NodeTracerProvider | undefined;

if (missing.length === 0) {
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: projectName,
      [SEMRESATTRS_PROJECT_NAME]: projectName,
    }),
    spanProcessors: [
      new SimpleSpanProcessor(
        new OTLPTraceExporter({
          url: "https://otlp.arize.com/v1/traces",
          headers: {
            "arize-space-id": process.env.ARIZE_SPACE_ID!,
            "arize-api-key": process.env.ARIZE_API_KEY!,
          },
        }),
      ),
    ],
  });
  provider.register();

  const instrumentation = new OpenAIAgentsInstrumentation({ tracerProvider: provider });
  instrumentation.manuallyInstrument(agents);
  console.log(`Arize AX tracing enabled for project: ${projectName}`);
} else {
  console.warn(`Arize AX tracing disabled; missing ${missing.join(", ")}.`);
}

export async function flushTracing(): Promise<void> {
  await provider?.forceFlush();
}
