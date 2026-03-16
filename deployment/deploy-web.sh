#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
BACKEND_URL="${BACKEND_URL:?Set BACKEND_URL, e.g. wss://livetax-relay-xxxxx.run.app/ws}"
SERVICE_NAME="${SERVICE_NAME:-livetax-web}"

gcloud run deploy "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --source . \
  --allow-unauthenticated \
  --set-env-vars "BACKEND_WS_URL=${BACKEND_URL}"
