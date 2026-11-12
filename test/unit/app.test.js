import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../../src/app.js";

const securityHeaders = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

async function withApp(adapter, run) {
  const app = buildApp({ adapter });
  try {
    await app.ready();
    await run(app);
  } finally {
    await app.close();
  }
}

function assertSecurityHeaders(response) {
  for (const [name, value] of Object.entries(securityHeaders)) {
    assert.equal(response.headers[name], value);
  }
}

function assertProblem(response, status, title, code) {
  assert.equal(response.statusCode, status);
  assert.match(
    response.headers["content-type"],
    /^application\/problem\+json; charset=utf-8/,
  );
  assert.deepEqual(response.json(), {
    type: "about:blank",
    title,
    status,
    code,
  });
  assert.doesNotMatch(response.body, /stack|configuration|\/home\//i);
  assertSecurityHeaders(response);
}

test("GET / serves the semantic page and external assets", async () => {
  await withApp({ getStatus: () => ({ kind: "success" }) }, async (app) => {
    const response = await app.inject({ method: "GET", url: "/" });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"], /^text\/html; charset=utf-8/);
    assert.match(response.body, /<h1>流程状态<\/h1>/);
    assert.doesNotMatch(response.body, /<(script|style)>/);
    assertSecurityHeaders(response);
  });
});

test("GET /api/status returns the exact successful contract once", async () => {
  let calls = 0;
  await withApp(
    {
      getStatus() {
        calls += 1;
        return { kind: "success" };
      },
    },
    async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/status" });

      assert.equal(response.statusCode, 200);
      assert.match(
        response.headers["content-type"],
        /^application\/json; charset=utf-8/,
      );
      assert.equal(response.headers["cache-control"], "no-store");
      assert.deepEqual(response.json(), { status: "ok" });
      assert.deepEqual(Object.keys(response.json()), ["status"]);
      assert.equal(calls, 1);
      assertSecurityHeaders(response);
    },
  );
});

test("GET /api/status maps one failure evaluation to the fixed 503 contract", async () => {
  let calls = 0;
  await withApp(
    {
      getStatus() {
        calls += 1;
        return { kind: "failure" };
      },
    },
    async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/status" });

      assertProblem(
        response,
        503,
        "Status unavailable",
        "STATUS_UNAVAILABLE",
      );
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(calls, 1);
    },
  );
});

test("GET /api/status rejects query and body input with the fixed 400 contract", async () => {
  let calls = 0;
  await withApp(
    {
      getStatus() {
        calls += 1;
        return { kind: "success" };
      },
    },
    async (app) => {
      for (const options of [
        { method: "GET", url: "/api/status?mode=failure" },
        {
          method: "GET",
          url: "/api/status",
          headers: { "content-type": "application/json" },
          payload: { mode: "failure" },
        },
      ]) {
        const response = await app.inject(options);
        assertProblem(response, 400, "Invalid request", "INVALID_REQUEST");
      }
      assert.equal(calls, 0);
    },
  );
});

test("GET /api/status maps adapter errors and invalid results without disclosure", async () => {
  for (const getStatus of [
    () => {
      throw new Error("sensitive configuration value");
    },
    () => ({ kind: "unexpected", configuration: "sensitive" }),
  ]) {
    await withApp({ getStatus }, async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/status" });
      assertProblem(
        response,
        503,
        "Status unavailable",
        "STATUS_UNAVAILABLE",
      );
      assert.doesNotMatch(response.body, /sensitive|unexpected/i);
    });
  }
});

test("GET /healthz reports process health without calling the adapter", async () => {
  await withApp(
    {
      getStatus() {
        assert.fail("health must not call the status adapter");
      },
    },
    async (app) => {
      const response = await app.inject({ method: "GET", url: "/healthz" });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { status: "ok" });
      assertSecurityHeaders(response);
    },
  );
});

test("GET /candidate-identity returns only the injected immutable identity", async () => {
  const app = buildApp({
    adapter: { getStatus: () => ({ kind: "success" }) },
    candidateIdentity: {
      deliveryId: "DLV-TEST",
      candidateSha: "0123456789abcdef",
    },
  });
  try {
    await app.ready();
    const response = await app.inject({
      method: "GET",
      url: "/candidate-identity",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.json(), {
      deliveryId: "DLV-TEST",
      candidateSha: "0123456789abcdef",
    });
    assertSecurityHeaders(response);
  } finally {
    await app.close();
  }
});

test("unknown paths return a safe 404", async () => {
  await withApp({ getStatus: () => ({ kind: "success" }) }, async (app) => {
    const response = await app.inject({ method: "GET", url: "/missing" });

    assert.equal(response.statusCode, 404);
    assert.doesNotMatch(response.body, /stack|\/home\//i);
    assertSecurityHeaders(response);
  });
});

test("unsupported methods return 405 with the allowed method", async () => {
  await withApp({ getStatus: () => ({ kind: "success" }) }, async (app) => {
    for (const method of ["POST", "OPTIONS"]) {
      const response = await app.inject({ method, url: "/api/status" });

      assert.equal(response.statusCode, 405);
      assert.equal(response.headers.allow, "GET");
      assertSecurityHeaders(response);
    }
  });
});

test("each request emits one sanitized request_completed event", async () => {
  const events = [];
  const app = buildApp({
    adapter: { getStatus: () => ({ kind: "failure" }) },
    writeEvent(event) {
      events.push(event);
    },
  });

  try {
    await app.ready();
    const responses = [
      await app.inject({ method: "GET", url: "/healthz" }),
      await app.inject({ method: "GET", url: "/api/status" }),
      await app.inject({
        method: "GET",
        url: "/missing?secret=must-not-be-logged",
        headers: { "user-agent": "private-agent" },
      }),
    ];

    assert.deepEqual(
      responses.map(({ statusCode }) => statusCode),
      [200, 503, 404],
    );
    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map(({ routeTemplate, method, statusCode }) => ({
        routeTemplate,
        method,
        statusCode,
      })),
      [
        { routeTemplate: "/healthz", method: "GET", statusCode: 200 },
        { routeTemplate: "/api/status", method: "GET", statusCode: 503 },
        { routeTemplate: null, method: "GET", statusCode: 404 },
      ],
    );

    for (const event of events) {
      assert.deepEqual(Object.keys(event).sort(), [
        "durationMs",
        "event",
        "method",
        "requestId",
        "routeTemplate",
        "statusCode",
      ]);
      assert.equal(event.event, "request_completed");
      assert.equal(typeof event.requestId, "string");
      assert.ok(event.requestId.length > 0);
      assert.equal(typeof event.durationMs, "number");
      assert.ok(Number.isFinite(event.durationMs));
      assert.ok(event.durationMs >= 0);
      assert.doesNotMatch(JSON.stringify(event), /secret|private-agent|missing/i);
    }
  } finally {
    await app.close();
  }
});
