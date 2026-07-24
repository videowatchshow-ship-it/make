#!/usr/bin/env bash
# 가상1번(win-vm) 정지 (요금 절약)
# 공식 문서: https://cloud.google.com/sdk/gcloud/reference/compute/instances/stop
set -e

VM_NAME="win-vm"
ZONE="asia-northeast3-a"

echo "■ 가상1번(${VM_NAME}) 정지 중..."
gcloud compute instances stop "${VM_NAME}" --zone="${ZONE}"

echo ""
echo "✅ 꺼짐! (이제 요금 거의 안 나갑니다)"
