import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const contentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

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

function methodNotAllowed(_request, reply) {
  return reply.header("Allow", "GET").code(405).send({
    error: "Method Not Allowed",
  });
}

export function buildApp({ adapter }) {
  if (!adapter || typeof adapter.getStatus !== "function") {
    throw new TypeError("A status adapter is required");
  }

  const app = Fastify({ logger: false });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Content-Security-Policy", contentSecurityPolicy);
  });

  app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/",
    index: false,
  });

  app.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").sendFile("index.html");
  });

  app.route({
    method: "GET",
    url: "/api/status",
    schema: {
      querystring: emptyInputSchema,
      response: { 200: statusResponseSchema },
    },
    handler: async (_request, reply) => {
      const result = adapter.getStatus();
      if (
        result?.kind !== "success" ||
        Object.keys(result).length !== 1
      ) {
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

  for (const url of ["/", "/api/status", "/healthz"]) {
    app.route({
      method: ["POST", "PUT", "PATCH", "DELETE"],
      url,
      handler: methodNotAllowed,
    });
  }

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({ error: "Not Found" });
  });

  return app;
}
