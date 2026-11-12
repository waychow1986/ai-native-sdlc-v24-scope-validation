const STATUS_MODES = new Set(["success", "failure", "fail-once"]);
const HOSTS = new Set(["0.0.0.0", "127.0.0.1"]);

export function parseConfiguration(environment = process.env) {
  const portText = environment.PORT ?? "3000";
  if (!/^[0-9]+$/.test(portText)) {
    throw new Error("Invalid PORT configuration");
  }

  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT configuration");
  }

  const host = environment.HOST ?? "0.0.0.0";
  if (!HOSTS.has(host)) {
    throw new Error("Invalid HOST configuration");
  }

  const statusMode = environment.STATUS_MODE ?? "success";
  if (!STATUS_MODES.has(statusMode)) {
    throw new Error("Invalid STATUS_MODE configuration");
  }

  return { host, port, statusMode };
}

export function createStatusAdapter({ mode = "success" } = {}) {
  if (!STATUS_MODES.has(mode)) {
    throw new Error("Invalid STATUS_MODE configuration");
  }

  return {
    getStatus() {
      return { kind: "success" };
    },
  };
}
