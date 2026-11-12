import { expect, test } from "playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";

async function startServer(mode, port) {
  const child = spawn(process.execPath, ["src/server.js"], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      STATUS_MODE: mode,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited before readiness: ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        return child;
      }
    } catch {
      // The process has not begun listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill("SIGTERM");
  throw new Error(`Test server readiness timed out: ${stderr}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await once(child, "exit");
}

async function withMode(mode, port, run) {
  const child = await startServer(mode, port);
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await stopServer(child);
  }
}

function collectStatusRequests(page, port) {
  const requests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.port === String(port) && url.pathname === "/api/status") {
      requests.push(request);
    }
  });
  return requests;
}

test("IQA-001 shows the fixed title and successful status on page load", async ({
  page,
}) => {
  const statusRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/status") {
      statusRequests.push(request);
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "流程状态" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("ok");
  await expect(page.getByRole("button", { name: "重新尝试" })).toHaveCount(0);
  expect(statusRequests).toHaveLength(1);
  expect(statusRequests[0].method()).toBe("GET");
  expect(statusRequests[0].postData()).toBeNull();
  expect(new URL(statusRequests[0].url()).search).toBe("");
});

test("IQA-002 shows an explicit failure and retry action without ok", async ({
  page,
}) => {
  const port = 3102;
  await withMode("failure", port, async (baseURL) => {
    const statusRequests = collectStatusRequests(page, port);
    await page.goto(baseURL);

    await expect(page.getByRole("heading", { name: "流程状态" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("状态获取失败，请重试。");
    await expect(page.getByRole("status")).not.toHaveText("ok");
    await expect(page.getByRole("button", { name: "重新尝试" })).toBeVisible();
    expect(statusRequests).toHaveLength(1);
  });
});

test("IQA-003 replaces the initial failure with ok after one retry", async ({
  page,
}) => {
  const port = 3103;
  await withMode("fail-once", port, async (baseURL) => {
    const statusRequests = collectStatusRequests(page, port);
    await page.goto(baseURL);
    await expect(page.getByRole("status")).toHaveText("状态获取失败，请重试。");

    await page.getByRole("button", { name: "重新尝试" }).click();

    await expect(page.getByRole("status")).toHaveText("ok");
    await expect(page.getByRole("button", { name: "重新尝试" })).toBeHidden();
    expect(statusRequests).toHaveLength(2);
  });
});

test("IQA-004 preserves retry after consecutive failures with one request per click", async ({
  page,
}) => {
  const port = 3104;
  await withMode("failure", port, async (baseURL) => {
    const statusRequests = collectStatusRequests(page, port);
    await page.goto(baseURL);
    await expect(page.getByRole("status")).toHaveText("状态获取失败，请重试。");

    await page.getByRole("button", { name: "重新尝试" }).click();

    await expect(page.getByRole("status")).toHaveText("状态获取失败，请重试。");
    await expect(page.getByRole("button", { name: "重新尝试" })).toBeEnabled();
    expect(statusRequests).toHaveLength(2);
  });
});
