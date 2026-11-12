#!/usr/bin/env bash
set -uo pipefail

result_path="${QA_RESULT_PATH:-}"
candidate_sha="${QA_CANDIDATE_SHA:-}"
base_url="${QA_BASE_URL:-}"
plan_commit_sha="${QA_PLAN_COMMIT_SHA:-}"
plan_hash="${QA_PLAN_HASH:-}"

if [[ -z "$result_path" ]]; then
  printf '%s\n' "QA_RESULT_PATH is required; no result destination was provided." >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

write_environment_failure() {
  local diagnostic="$1"
  jq -n \
    --arg testedCommitSha "$candidate_sha" \
    --arg environmentUrl "$base_url" \
    --arg qaPlanCommitSha "$plan_commit_sha" \
    --arg qaPlanHash "$plan_hash" \
    --arg diagnostic "$diagnostic" \
    '{
      passed: false,
      testedCommitSha: $testedCommitSha,
      environmentUrl: $environmentUrl,
      summary: "Independent QA 因执行环境或 Candidate 就绪失败而未完成。",
      qaPlanCommitSha: $qaPlanCommitSha,
      qaPlanHash: $qaPlanHash,
      defects: [],
      testGaps: [],
      evidence: [$diagnostic],
      bugfixResults: [],
      scenarios: [
        {id: "AC-001", passed: false, externalServices: [], evidence: $diagnostic},
        {id: "AC-002", passed: false, externalServices: [], evidence: $diagnostic},
        {id: "AC-003", passed: false, externalServices: [], evidence: $diagnostic},
        {id: "AC-004", passed: false, externalServices: [], evidence: $diagnostic}
      ]
    }' >"$work_dir/result.json"
  mv "$work_dir/result.json" "$result_path"
}

required_names=(
  QA_DELIVERY_ID
  QA_CANDIDATE_SHA
  QA_BASE_URL
  QA_HEALTH_PATH
  QA_PLAN_COMMIT_SHA
  QA_PLAN_HASH
)
missing_names=()
for name in "${required_names[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing_names+=("$name")
  fi
done
if ((${#missing_names[@]} > 0)); then
  write_environment_failure "缺少必需 QA 输入：${missing_names[*]}。"
  exit 0
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1 ||
  ! command -v node >/dev/null 2>&1; then
  write_environment_failure "QA Runner 缺少必需的 curl、jq 或 node 工具。"
  exit 0
fi

base_url="${QA_BASE_URL%/}"
health_path="$QA_HEALTH_PATH"
if [[ ! "$base_url" =~ ^https?://[^[:space:]]+$ ]] ||
  [[ "$base_url" == *"@"* ]] ||
  [[ "$health_path" != /* ]] ||
  [[ "$health_path" == *$'\n'* ]]; then
  write_environment_failure "QA_BASE_URL 或 QA_HEALTH_PATH 格式无效。"
  exit 0
fi

deadline=$((SECONDS + 300))
ready=false
last_diagnostic="Candidate 尚未开始就绪检查。"
while ((SECONDS < deadline)); do
  remaining=$((deadline - SECONDS))
  request_timeout=10
  if ((remaining < request_timeout)); then
    request_timeout="$remaining"
  fi
  if ((request_timeout < 1)); then
    break
  fi

  if curl --fail --silent --show-error \
    --connect-timeout 5 --max-time "$request_timeout" \
    "$base_url$health_path" >"$work_dir/health.json" 2>"$work_dir/curl.err"; then
    :
  else
    curl_exit=$?
    last_diagnostic="Candidate health 请求失败（curl exit $curl_exit）。"
    remaining=$((deadline - SECONDS))
    if ((remaining > 5)); then
      sleep 5
    elif ((remaining > 0)); then
      sleep "$remaining"
    fi
    continue
  fi

  if ! jq -e '. == {status: "ok"}' "$work_dir/health.json" >/dev/null 2>&1; then
    last_diagnostic="Candidate health 响应不符合预期 JSON。"
  else
    remaining=$((deadline - SECONDS))
    request_timeout=10
    if ((remaining < request_timeout)); then
      request_timeout="$remaining"
    fi
    if ((request_timeout < 1)); then
      break
    fi
    identity_received=false
    if curl --fail --silent --show-error \
      --connect-timeout 5 --max-time "$request_timeout" \
      "$base_url/candidate-identity" >"$work_dir/identity.json" 2>"$work_dir/curl.err"; then
      identity_received=true
    else
      curl_exit=$?
      last_diagnostic="Candidate identity 请求失败（curl exit $curl_exit）。"
    fi
    if [[ "$identity_received" == true ]] && ! jq -e \
      --arg deliveryId "$QA_DELIVERY_ID" \
      --arg candidateSha "$QA_CANDIDATE_SHA" \
      '. == {deliveryId: $deliveryId, candidateSha: $candidateSha}' \
      "$work_dir/identity.json" >/dev/null 2>&1; then
      last_diagnostic="Candidate identity 与平台提供的 Delivery ID 或 Candidate SHA 不匹配。"
    elif [[ "$identity_received" == true ]]; then
      ready=true
      break
    fi
  fi

  remaining=$((deadline - SECONDS))
  if ((remaining > 5)); then
    sleep 5
  elif ((remaining > 0)); then
    sleep "$remaining"
  fi
done

if [[ "$ready" != true ]]; then
  write_environment_failure "Candidate 在五分钟内未就绪：$last_diagnostic"
  exit 0
fi

if ! node --input-type=module >"$work_dir/functional.json" 2>"$work_dir/browser.err" <<'NODE'
import { chromium } from "playwright";

const baseURL = process.env.QA_BASE_URL.replace(/\/+$/, "");
const scenarios = ["AC-001", "AC-002", "AC-003", "AC-004"].map((id) => ({
  id,
  passed: false,
  externalServices: [],
  evidence: "场景尚未执行。",
}));
const byId = Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario]));
const defects = [];
const testGaps = [];
const evidence = [
  "远程 health 与 Candidate identity 已匹配平台提供的 Delivery ID 和 Candidate SHA。",
];

function visibleSnapshot(page) {
  return page.evaluate(() => {
    const result = document.querySelector("#status-result");
    const failure = document.querySelector("#failure-result");
    const retry = document.querySelector("#retry-status");
    const isVisible = (element) =>
      element instanceof HTMLElement &&
      !element.hidden &&
      getComputedStyle(element).display !== "none" &&
      getComputedStyle(element).visibility !== "hidden";
    return {
      title: document.querySelector("h1")?.textContent?.trim() ?? "",
      resultVisible: isVisible(result),
      resultText: result?.textContent?.trim() ?? "",
      failureVisible: isVisible(failure),
      failureText: document.querySelector("#failure-message")?.textContent?.trim() ?? "",
      retryVisible: isVisible(retry),
      retryEnabled: retry instanceof HTMLButtonElement && !retry.disabled,
    };
  });
}

async function waitForSettled(page) {
  await page.waitForFunction(() => {
    const result = document.querySelector("#status-result");
    const failure = document.querySelector("#failure-result");
    return result?.dataset.state === "success" || (failure && !failure.hidden);
  }, undefined, { timeout: 30_000 });
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const statusRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(baseURL).origin && url.pathname === "/api/status") {
      statusRequests.push({ method: request.method(), postData: request.postData(), search: url.search });
    }
  });

  await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForSettled(page);
  let snapshot = await visibleSnapshot(page);
  const titleExact = snapshot.title === "流程状态";

  if (!titleExact) {
    defects.push(`首页标题应为“流程状态”，实际为“${snapshot.title}”。`);
  }

  if (snapshot.resultVisible && snapshot.resultText === "ok") {
    const requestExact =
      statusRequests.length === 1 &&
      statusRequests[0].method === "GET" &&
      statusRequests[0].postData === null &&
      statusRequests[0].search === "";
    byId["AC-001"].passed = titleExact && requestExact;
    byId["AC-001"].evidence =
      `真实 Chromium 首次加载：标题“${snapshot.title}”，状态“${snapshot.resultText}”，` +
      `/api/status 请求数 ${statusRequests.length}。`;
    if (!requestExact) {
      defects.push(`AC-001 首次页面加载应发起一次无 query/body 的 GET /api/status，实际请求数为 ${statusRequests.length}。`);
    }
    for (const id of ["AC-002", "AC-003", "AC-004"]) {
      byId[id].evidence = "当前远程 target 仅提供成功结果条件，未建立本场景所需的失败前置条件。";
    }
    testGaps.push("当前远程 target 仅提供成功结果条件，无法建立 AC-002、AC-003 和 AC-004 所需的失败及重试结果前置条件。");
  } else if (snapshot.failureVisible) {
    const explicitFailure = snapshot.failureText.includes("失败");
    const initialRequestExact = statusRequests.length === 1;
    byId["AC-002"].passed =
      titleExact &&
      explicitFailure &&
      snapshot.retryVisible &&
      snapshot.retryEnabled &&
      snapshot.resultText !== "ok" &&
      initialRequestExact;
    byId["AC-002"].evidence =
      `真实 Chromium 首次加载：标题“${snapshot.title}”，失败提示“${snapshot.failureText}”，` +
      `重试可用=${snapshot.retryVisible && snapshot.retryEnabled}，/api/status 请求数 ${statusRequests.length}。`;
    if (!byId["AC-002"].passed) {
      defects.push("AC-002 的标题、明确失败提示、可用重新尝试操作或单次首次状态查看不符合预期。");
    }

    if (!snapshot.retryVisible || !snapshot.retryEnabled) {
      byId["AC-001"].evidence = "当前远程 target 未提供成功结果条件。";
      byId["AC-003"].evidence = "首次失败后没有可用的重新尝试操作，无法执行恢复操作。";
      byId["AC-004"].evidence = "首次失败后没有可用的重新尝试操作，无法执行连续失败操作。";
      testGaps.push("当前远程 target 未提供成功结果条件，无法执行 AC-001。");
    } else {
      await page.getByRole("button", { name: "重新尝试" }).click();
      await page.waitForFunction(() => {
        const result = document.querySelector("#status-result");
        const failure = document.querySelector("#failure-result");
        const retry = document.querySelector("#retry-status");
        return (
          result?.dataset.state === "success" ||
          (failure && !failure.hidden && retry instanceof HTMLButtonElement && !retry.disabled)
        );
      }, undefined, { timeout: 30_000 });
      snapshot = await visibleSnapshot(page);
      const retryRequestExact = statusRequests.length === 2;

      if (snapshot.resultVisible && snapshot.resultText === "ok") {
      byId["AC-003"].passed = retryRequestExact;
      byId["AC-003"].evidence =
        `首次失败后点击一次重试，当前结果更新为“ok”，累计 /api/status 请求数 ${statusRequests.length}。`;
      if (!retryRequestExact) {
        defects.push(`AC-003 点击一次重新尝试应只新增一次状态查看，实际累计请求数为 ${statusRequests.length}。`);
      }
      byId["AC-004"].evidence = "当前远程 target 的重试结果为成功，未建立连续失败前置条件。";
      testGaps.push("当前远程 target 未提供连续失败结果条件，无法执行 AC-004。");

      const requestsBeforeReload = statusRequests.length;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      await waitForSettled(page);
      const successSnapshot = await visibleSnapshot(page);
      const reloadRequests = statusRequests.length - requestsBeforeReload;
      byId["AC-001"].passed =
        successSnapshot.title === "流程状态" &&
        successSnapshot.resultVisible &&
        successSnapshot.resultText === "ok" &&
        reloadRequests === 1;
      byId["AC-001"].evidence =
        `重试成功后重新打开首页：标题“${successSnapshot.title}”，状态“${successSnapshot.resultText}”，` +
        `本次 /api/status 请求数 ${reloadRequests}。`;
      } else if (snapshot.failureVisible) {
      byId["AC-004"].passed =
        snapshot.failureText.includes("失败") &&
        snapshot.retryVisible &&
        snapshot.retryEnabled &&
        retryRequestExact;
      byId["AC-004"].evidence =
        `首次失败后点击一次重试，仍显示“${snapshot.failureText}”，重试继续可用，` +
        `累计 /api/status 请求数 ${statusRequests.length}。`;
      if (!byId["AC-004"].passed) {
        defects.push("AC-004 再次失败后的明确提示、重试可用性或单次重试请求不符合预期。");
      }
      byId["AC-001"].evidence = "当前远程 target 未提供成功结果条件。";
      byId["AC-003"].evidence = "当前远程 target 未提供失败后重试成功结果条件。";
      testGaps.push("当前远程 target 仅提供持续失败结果条件，无法执行 AC-001 和 AC-003。");
      } else {
        defects.push("重新尝试后页面既未呈现成功结果，也未呈现明确失败结果。");
        byId["AC-003"].evidence = "重新尝试后没有可判定的成功或失败结果。";
        byId["AC-004"].evidence = "重新尝试后没有可判定的成功或失败结果。";
        byId["AC-001"].evidence = "当前远程 target 未建立可验证的成功结果条件。";
      }
    }
  } else {
    defects.push("首页状态查看结束后既未显示固定成功文字“ok”，也未显示明确失败提示和重试操作。");
    byId["AC-001"].evidence = "首次状态查看没有可判定的成功结果。";
    byId["AC-002"].evidence = "首次状态查看没有可判定的失败结果。";
    byId["AC-003"].evidence = "缺少可操作的首次失败前置结果。";
    byId["AC-004"].evidence = "缺少可操作的首次失败前置结果。";
  }

  evidence.push(...scenarios.map((scenario) => `${scenario.id}: ${scenario.evidence}`));
  process.stdout.write(JSON.stringify({ defects, testGaps, evidence, scenarios }));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
} finally {
  await browser?.close();
}
NODE
then
  browser_diagnostic="$(tr '\r\n' '  ' <"$work_dir/browser.err" | cut -c1-500)"
  write_environment_failure "真实 Chromium 黑盒执行失败：${browser_diagnostic:-未提供诊断信息}。"
  exit 0
fi

if ! jq -e '
  (.defects | type == "array" and all(.[]; type == "string")) and
  (.testGaps | type == "array" and all(.[]; type == "string")) and
  (.evidence | type == "array" and all(.[]; type == "string")) and
  (.scenarios | type == "array" and length == 4) and
  ([.scenarios[].id] | sort == ["AC-001", "AC-002", "AC-003", "AC-004"]) and
  all(.scenarios[]; (.passed | type == "boolean") and
    (.externalServices | type == "array") and (.externalServices | length == 0) and
    (.evidence | type == "string"))
' "$work_dir/functional.json" >/dev/null 2>&1; then
  write_environment_failure "QA 浏览器执行结果无法通过内部 schema 自检。"
  exit 0
fi

jq -n \
  --arg testedCommitSha "$QA_CANDIDATE_SHA" \
  --arg environmentUrl "$base_url" \
  --arg qaPlanCommitSha "$QA_PLAN_COMMIT_SHA" \
  --arg qaPlanHash "$QA_PLAN_HASH" \
  --slurpfile functional "$work_dir/functional.json" \
  '($functional[0]) as $f |
  ($f.defects | length == 0) as $noDefects |
  ($f.testGaps | length == 0) as $noGaps |
  (all($f.scenarios[]; .passed == true)) as $allScenariosPassed |
  ($noDefects and $noGaps and $allScenariosPassed) as $passed |
  {
    passed: $passed,
    testedCommitSha: $testedCommitSha,
    environmentUrl: $environmentUrl,
    summary: (if $passed
      then "Independent QA 的四个批准验收场景全部通过。"
      else "Independent QA 未通过；请查看 defects、testGaps 和 scenarios。"
    end),
    qaPlanCommitSha: $qaPlanCommitSha,
    qaPlanHash: $qaPlanHash,
    defects: $f.defects,
    testGaps: $f.testGaps,
    evidence: $f.evidence,
    bugfixResults: [],
    scenarios: $f.scenarios
  }' >"$work_dir/result.json"

mv "$work_dir/result.json" "$result_path"
exit 0
