#!/usr/bin/env bash
set -euo pipefail

# Ensures a service account holds roles/run.invoker on a Cloud Run service.
# Checks existing IAM policy first to skip redundant writes and retries on
# transient ETag concurrency conflicts with exponential backoff + jitter.

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <project-id> <region> <target-service> <service-account-email>" >&2
  exit 2
fi

PROJECT_ID="$1"
REGION="$2"
TARGET_SVC="$3"
SA_EMAIL="$4"
MAX_ATTEMPTS="${IAM_MAX_ATTEMPTS:-5}"
RETRY_SCALE="${IAM_RETRY_SCALE:-1}"

is_invoker_bound() {
  local policy_json
  if ! policy_json=$(gcloud run services get-iam-policy "${TARGET_SVC}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format=json 2>/dev/null); then
    return 1
  fi

  python3 - "${policy_json}" "${SA_EMAIL}" <<'PY'
import json
import sys

try:
    policy = json.loads(sys.argv[1] or "{}")
except json.JSONDecodeError:
    sys.exit(1)

member = f"serviceAccount:{sys.argv[2]}"
for binding in policy.get("bindings") or []:
    if binding.get("role") == "roles/run.invoker" and member in (binding.get("members") or []):
        sys.exit(0)
sys.exit(1)
PY
}

attempt=1
while [ "${attempt}" -le "${MAX_ATTEMPTS}" ]; do
  if is_invoker_bound; then
    echo "IAM binding roles/run.invoker already present for serviceAccount:${SA_EMAIL} on ${TARGET_SVC}."
    exit 0
  fi

  if output=$(gcloud run services add-iam-policy-binding "${TARGET_SVC}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/run.invoker" \
    --quiet 2>&1); then
    printf '%s\n' "${output}"
    exit 0
  fi

  printf '%s\n' "${output}" >&2

  # Another concurrent job may have applied this same binding just before our write conflicted.
  if is_invoker_bound; then
    echo "IAM binding roles/run.invoker confirmed present for serviceAccount:${SA_EMAIL} on ${TARGET_SVC} after concurrent update."
    exit 0
  fi

  if [ "${attempt}" -eq "${MAX_ATTEMPTS}" ]; then
    echo "Failed to bind roles/run.invoker for serviceAccount:${SA_EMAIL} on ${TARGET_SVC} after ${MAX_ATTEMPTS} attempts." >&2
    exit 1
  fi

  backoff=$(( (1 << (attempt - 1)) + (RANDOM % 3) ))
  sleep_duration=$(python3 -c "import sys; print(f'{float(sys.argv[1]) * float(sys.argv[2]):.3f}')" "${backoff}" "${RETRY_SCALE}")
  echo "Retrying IAM policy binding for ${TARGET_SVC} in ${sleep_duration}s (attempt $((attempt + 1))/${MAX_ATTEMPTS})..." >&2
  sleep "${sleep_duration}"
  attempt=$((attempt + 1))
done
