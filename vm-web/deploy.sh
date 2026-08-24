#!/bin/bash
# VM Control Panel - Cloud Run Deployment Script
# Run this locally: bash deploy.sh

set -e

# Configuration
GCP_PROJECT="quantum-bonus-455522-b4"
REGION="asia-northeast3"
SERVICE_NAME="vm-panel"
VM_ZONE="asia-northeast3-a"
VM_NAME="win-vm"

# Prompt for password if not provided
if [ -z "$PANEL_PASSWORD" ]; then
  echo "🔐 Enter the panel password:"
  read -s PANEL_PASSWORD
  echo ""
fi

if [ -z "$PANEL_PASSWORD" ]; then
  echo "❌ Password cannot be empty"
  exit 1
fi

echo "📦 Deploying VM control panel to Cloud Run..."
echo "  Project: $GCP_PROJECT"
echo "  Region: $REGION"
echo "  Password: ••••••"

# Deploy to Cloud Run
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --project "$GCP_PROJECT" \
  --set-env-vars "GCP_PROJECT=$GCP_PROJECT,VM_ZONE=$VM_ZONE,VM_NAME=$VM_NAME,PANEL_PASSWORD=$PANEL_PASSWORD"

# Get the service account
SERVICE_ACCOUNT=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$GCP_PROJECT" \
  --format='value(spec.template.spec.serviceAccountName)')

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Setting up IAM permissions..."
echo "  Service Account: $SERVICE_ACCOUNT"

# Grant VM control permissions
gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/compute.instanceAdmin.v1" \
  --quiet

echo ""
echo "🎉 All done!"
echo "   Panel URL: https://${SERVICE_NAME}-$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$GCP_PROJECT" --format='value(status.url)' | cut -d'-' -f4-)"
