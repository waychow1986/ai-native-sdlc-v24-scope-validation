#!/usr/bin/env bash
set -euo pipefail

: "${AIDELIVERY_DELIVERY_ID:?AIDELIVERY_DELIVERY_ID is required}"
: "${AIDELIVERY_CANDIDATE_SHA:?AIDELIVERY_CANDIDATE_SHA is required}"
: "${DEV_FUNCTIONAL_BASE_URL:?DEV_FUNCTIONAL_BASE_URL is required}"
: "${DEV_FUNCTIONAL_RESULT_PATH:?DEV_FUNCTIONAL_RESULT_PATH is required}"

base_url="${DEV_FUNCTIONAL_BASE_URL%/}"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

write_result() {
  local passed="$1"
  local evidence="$2"
  jq -n \
    --argjson passed "$passed" \
    --arg evidence "$evidence" \
    '{
      passed: $passed,
      scenarios: [{
        id: "IQA-001",
        passed: $passed,
        externalServices: [],
        evidence: $evidence
      }],
      evidence: [$evidence]
    }' >"$DEV_FUNCTIONAL_RESULT_PATH"
}

fail() {
  write_result false "$1"
  exit 1
}

curl --fail --silent --show-error \
  "$base_url/candidate-identity" >"$work_dir/identity.json" ||
  fail "Candidate identity endpoint request failed."
jq -e \
  --arg deliveryId "$AIDELIVERY_DELIVERY_ID" \
  --arg candidateSha "$AIDELIVERY_CANDIDATE_SHA" \
  '. == {deliveryId: $deliveryId, candidateSha: $candidateSha}' \
  "$work_dir/identity.json" >/dev/null ||
  fail "Candidate identity did not match the platform-provided identity."

curl --fail --silent --show-error "$base_url/" >"$work_dir/index.html" ||
  fail "Homepage request failed."
grep -Fq '<h1>流程状态</h1>' "$work_dir/index.html" ||
  fail "Homepage did not contain the fixed title."

curl --fail --silent --show-error \
  "$base_url/api/status" >"$work_dir/status.json" ||
  fail "Status request failed."
jq -e '. == {status: "ok"}' "$work_dir/status.json" >/dev/null ||
  fail "Status response did not contain the fixed successful result."

write_result true "IQA-001 passed against the deployed Candidate: the homepage title and status result were exact."
