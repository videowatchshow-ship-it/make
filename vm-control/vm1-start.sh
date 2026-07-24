#!/usr/bin/env bash
# 가상1번(win-vm) 시작 + 접속 IP 출력
# 공식 문서: https://cloud.google.com/sdk/gcloud/reference/compute/instances/start
set -e

VM_NAME="win-vm"
ZONE="asia-northeast3-a"

echo "▶ 가상1번(${VM_NAME}) 시작 중..."
gcloud compute instances start "${VM_NAME}" --zone="${ZONE}"

IP=$(gcloud compute instances describe "${VM_NAME}" --zone="${ZONE}" \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)")

echo ""
echo "✅ 켜짐! 접속 IP: ${IP}"
echo "1~2분 뒤 원격데스크톱(Windows App)에서 위 IP로 접속하세요. (아이디: admin)"
echo "비번 새로 받기:"
echo "  gcloud compute reset-windows-password ${VM_NAME} --zone=${ZONE} --user=admin"
