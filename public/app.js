const result = document.querySelector("#status-result");

function isSuccessPayload(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    value.status === "ok"
  );
}

async function requestStatus() {
  result.dataset.state = "loading";
  result.textContent = "正在获取状态…";

  try {
    const response = await fetch("/api/status", {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (
      response.status !== 200 ||
      !contentType.startsWith("application/json")
    ) {
      throw new Error("Status request failed");
    }

    const payload = await response.json();
    if (!isSuccessPayload(payload)) {
      throw new Error("Invalid status response");
    }

    result.dataset.state = "success";
    result.textContent = "ok";
  } catch {
    result.dataset.state = "failure";
    result.textContent = "状态获取失败，请重试。";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void requestStatus();
}, { once: true });
