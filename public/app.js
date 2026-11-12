const result = document.querySelector("#status-result");
const failureResult = document.querySelector("#failure-result");
const retryButton = document.querySelector("#retry-status");
let activeController;
let currentAttempt = 0;

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
  const attempt = currentAttempt + 1;
  currentAttempt = attempt;
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;

  failureResult.hidden = true;
  retryButton.disabled = true;
  result.hidden = false;
  result.dataset.state = "loading";
  result.textContent = "正在获取状态…";

  try {
    const response = await fetch("/api/status", {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
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
    if (attempt !== currentAttempt) {
      return;
    }

    result.dataset.state = "success";
    result.textContent = "ok";
  } catch {
    if (attempt !== currentAttempt) {
      return;
    }
    result.hidden = true;
    result.dataset.state = "failure";
    failureResult.hidden = false;
    retryButton.disabled = false;
  } finally {
    if (attempt === currentAttempt) {
      activeController = undefined;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  retryButton.addEventListener("click", () => {
    if (!activeController) {
      void requestStatus();
    }
  });
  void requestStatus();
}, { once: true });

window.addEventListener("beforeunload", () => {
  activeController?.abort();
}, { once: true });
