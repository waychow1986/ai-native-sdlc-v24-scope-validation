import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const contentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const requestStartedAt = Symbol("requestStartedAt");

const emptyInputSchema = {
  type: "object",
  additionalProperties: false,
};

const statusResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: {
    status: { type: "string", const: "ok" },
  },
};

const candidateIdentityResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["deliveryId", "candidateSha"],
  properties: {
    deliveryId: { type: "string", minLength: 1 },
    candidateSha: { type: "string", minLength: 1 },
  },
};

const problemResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "title", "status", "code"],
  properties: {
    type: { type: "string", const: "about:blank" },
    title: { type: "string" },
    status: { type: "integer" },
    code: { type: "string" },
  },
};

function writeFixedErrorEvent(event) {
  process.stderr.write(`${JSON.stringify({ event })}\n`);
}

function writeRequestEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function sendProblem(reply, status, title, code) {
  return reply
    .header("Cache-Control", "no-store")
    .type("application/problem+json; charset=utf-8")
    .code(status)
    .send({
      type: "about:blank",
      title,
      status,
      code,
    });
}

function methodNotAllowed(_request, reply) {
  return reply.header("Allow", "GET").code(405).send({
    error: "Method Not Allowed",
  });
}

export function buildApp({
  adapter,
  candidateIdentity = null,
  writeEvent = writeRequestEvent,
}) {
  if (!adapter || typeof adapter.getStatus !== "function") {
    throw new TypeError("A status adapter is required");
  }

  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (request) => {
    request[requestStartedAt] = process.hrtime.bigint();
  });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Content-Security-Policy", contentSecurityPolicy);
  });

  app.addHook("onResponse", async (request, reply) => {
    const elapsed = process.hrtime.bigint() - request[requestStartedAt];
    writeEvent({
      event: "request_completed",
      routeTemplate: request.routeOptions.url ?? null,
      method: request.method,
      statusCode: reply.statusCode,
      durationMs: Number(elapsed) / 1_000_000,
      requestId: String(request.id),
    });
  });

  app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/",
    index: false,
  });

  app.setErrorHandler((error, request, reply) => {
    if (request.routeOptions.url === "/api/status") {
      if (error.validation || error.statusCode === 400) {
        return sendProblem(reply, 400, "Invalid request", "INVALID_REQUEST");
      }
      writeFixedErrorEvent("uncaught_error");
      return sendProblem(
        reply,
        503,
        "Status unavailable",
        "STATUS_UNAVAILABLE",
      );
    }

    return reply.code(500).send({ error: "Internal Server Error" });
  });

  app.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").sendFile("index.html");
  });

  app.route({
    method: "GET",
    url: "/api/status",
    schema: {
      querystring: emptyInputSchema,
      response: {
        200: statusResponseSchema,
        400: problemResponseSchema,
        503: problemResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const contentLength = request.headers["content-length"];
      if (
        request.raw.url.includes("?") ||
        request.body !== undefined ||
        request.headers["transfer-encoding"] !== undefined ||
        (contentLength !== undefined && contentLength !== "0")
      ) {
        return sendProblem(reply, 400, "Invalid request", "INVALID_REQUEST");
      }
      const result = adapter.getStatus();
      if (!result || Object.keys(result).length !== 1) {
        throw new Error("Status adapter returned an invalid result");
      }

      if (result.kind === "failure") {
        writeFixedErrorEvent("status_unavailable");
        return sendProblem(
          reply,
          503,
          "Status unavailable",
          "STATUS_UNAVAILABLE",
        );
      }
      if (result.kind !== "success") {
        throw new Error("Status adapter returned an invalid result");
      }

      return reply
        .header("Cache-Control", "no-store")
        .send({ status: "ok" });
    },
  });

  app.get(
    "/healthz",
    {
      schema: {
        querystring: emptyInputSchema,
        response: { 200: statusResponseSchema },
      },
    },
    async () => ({ status: "ok" }),
  );

  app.get(
    "/candidate-identity",
    {
      schema: {
        querystring: emptyInputSchema,
        response: { 200: candidateIdentityResponseSchema },
      },
    },
    async (_request, reply) => {
      if (
        !candidateIdentity ||
        typeof candidateIdentity.deliveryId !== "string" ||
        candidateIdentity.deliveryId.length === 0 ||
        typeof candidateIdentity.candidateSha !== "string" ||
        candidateIdentity.candidateSha.length === 0
      ) {
        return reply.code(503).send({ error: "Candidate identity unavailable" });
      }

      return reply.header("Cache-Control", "no-store").send(candidateIdentity);
    },
  );

  for (const url of ["/", "/api/status", "/healthz", "/candidate-identity"]) {
    app.route({
      method: ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      url,
      handler: methodNotAllowed,
    });
  }

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({ error: "Not Found" });
  });

  return app;
}
