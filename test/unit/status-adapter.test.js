import assert from "node:assert/strict";
import test from "node:test";

import {
  createStatusAdapter,
  parseConfiguration,
} from "../../src/status-adapter.js";

test("the default adapter returns only the strict success result", () => {
  const adapter = createStatusAdapter();

  assert.deepEqual(adapter.getStatus(), { kind: "success" });
  assert.deepEqual(Object.keys(adapter.getStatus()), ["kind"]);
});

test("separate default adapter instances begin in the same initial state", () => {
  const first = createStatusAdapter();
  const second = createStatusAdapter();

  assert.deepEqual(first.getStatus(), { kind: "success" });
  assert.deepEqual(second.getStatus(), { kind: "success" });
});

test("configuration accepts the documented defaults and explicit values", () => {
  assert.deepEqual(parseConfiguration({}), {
    host: "0.0.0.0",
    port: 3000,
    statusMode: "success",
  });
  assert.deepEqual(
    parseConfiguration({
      HOST: "127.0.0.1",
      PORT: "65535",
      STATUS_MODE: "success",
    }),
    { host: "127.0.0.1", port: 65535, statusMode: "success" },
  );
});

for (const [name, environment, secretValue] of [
  ["PORT", { PORT: "0" }, "0"],
  ["PORT", { PORT: "65536" }, "65536"],
  ["PORT", { PORT: "3.14" }, "3.14"],
  ["HOST", { HOST: "example.invalid" }, "example.invalid"],
  ["STATUS_MODE", { STATUS_MODE: "unknown-mode" }, "unknown-mode"],
]) {
  test(`configuration rejects invalid ${name} without disclosing its value`, () => {
    assert.throws(
      () => parseConfiguration(environment),
      (error) =>
        error instanceof Error &&
        error.message === `Invalid ${name} configuration` &&
        !error.message.includes(secretValue),
    );
  });
}
