import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./create-app.ts";

type Environment = Readonly<Record<string, string | undefined>>;

export function resolveServerConfig(environment: Environment) {
  const mode = environment.APP_MODE ?? "demo";
  if (mode !== "demo") {
    throw new Error(`Unsupported runtime mode: ${mode}`);
  }

  const portValue = environment.PORT;
  const port = portValue === undefined ? 4000 : parsePort(portValue);
  const host = environment.HOST ?? "127.0.0.1";
  if (host.trim().length === 0) {
    throw new Error("Invalid HOST: host must not be blank");
  }
  return Object.freeze({ mode, host, port });
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

async function bootstrap(): Promise<void> {
  const config = resolveServerConfig(process.env);
  const app = await createApp({ mode: config.mode });
  await app.listen(config.port, config.host);
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  void bootstrap().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "API bootstrap failed");
    process.exitCode = 1;
  });
}
