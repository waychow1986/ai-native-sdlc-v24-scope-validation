import { expect, test } from "playwright/test";

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
