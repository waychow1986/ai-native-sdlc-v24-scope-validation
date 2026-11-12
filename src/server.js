import { buildApp } from "./app.js";
import {
  createStatusAdapter,
  parseConfiguration,
} from "./status-adapter.js";

function writeEvent(stream, event, details = {}) {
  stream.write(`${JSON.stringify({ event, ...details })}\n`);
}

let configuration;
try {
  configuration = parseConfiguration();
} catch {
  writeEvent(process.stderr, "configuration_invalid");
  process.exitCode = 1;
}

if (configuration) {
  const adapter = createStatusAdapter({ mode: configuration.statusMode });
  const app = buildApp({ adapter });
  let stopping = false;

  const stop = async (signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    writeEvent(process.stdout, "service_stopping", { signal });
    await app.close();
  };

  process.once("SIGTERM", () => {
    void stop("SIGTERM");
  });
  process.once("SIGINT", () => {
    void stop("SIGINT");
  });

  try {
    await app.listen({
      host: configuration.host,
      port: configuration.port,
    });
    writeEvent(process.stdout, "service_started");
  } catch {
    writeEvent(process.stderr, "uncaught_error");
    process.exitCode = 1;
    await app.close();
  }
}
