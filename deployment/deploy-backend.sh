#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-livetax-relay}"
GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
GEMINI_LIVE_MODEL="${GEMINI_LIVE_MODEL:-gemini-live-2.5-flash-native-audio}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:?Set SERVICE_ACCOUNT, e.g. livetax-relay@${PROJECT_ID}.iam.gserviceaccount.com}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://YOUR_WEB_URL}"

gcloud run deploy "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --source ./backend \
  --allow-unauthenticated \
  --service-account "${SERVICE_ACCOUNT}" \
  --timeout 3600 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION},GEMINI_LIVE_MODEL=${GEMINI_LIVE_MODEL},ALLOWED_ORIGINS=${ALLOWED_ORIGINS}"
