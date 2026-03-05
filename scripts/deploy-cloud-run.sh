#!/usr/bin/env bash
# Deploy VantAIge to Google Cloud Run
# Requires: gcloud CLI
# Optional: set GOOGLE_CLOUD_PROJECT, CLOUD_RUN_REGION, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-vantaige-417aa}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"

echo "Project: $PROJECT_ID, Region: $REGION"

# Enable APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com --project="$PROJECT_ID"

# --- 1. Deploy WebSocket backend first ---
echo "Deploying WebSocket backend (vantaige-ws)..."
cd "$ROOT_DIR/backend"
gcloud run deploy vantaige-ws \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION" \
  --platform managed \
  --quiet

WS_URL=$(gcloud run services describe vantaige-ws --region "$REGION" --project "$PROJECT_ID" --format 'value(status.url)')
WS_WS_URL="wss://${WS_URL#https://}/ws"
echo "WebSocket URL: $WS_WS_URL"

# --- 2. Ensure Artifact Registry repo exists ---
echo "Ensuring Artifact Registry repo..."
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  2>/dev/null || true

# --- 3. Deploy Next.js app via Cloud Build (for build-time NEXT_PUBLIC_* vars) ---
cd "$ROOT_DIR"
echo "Deploying Next.js app (vantaige)..."

SUBST=""
SUBST="${SUBST}_WS_URL=${WS_WS_URL},"
SUBST="${SUBST}_REGION=${REGION},"
SUBST="${SUBST}_SUPABASE_URL=${SUPABASE_URL},"
SUBST="${SUBST}_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"

gcloud builds submit \
  --config=cloudbuild-web.yaml \
  --substitutions="$SUBST" \
  --project="$PROJECT_ID"

# Set runtime env vars (GOOGLE_CLOUD_* for server-side)
gcloud run services update vantaige \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION" \
  --quiet

APP_URL=$(gcloud run services describe vantaige --region "$REGION" --project "$PROJECT_ID" --format 'value(status.url)')
echo ""
echo "Deployment complete."
echo "  App:       $APP_URL"
echo "  WebSocket: $WS_WS_URL"
