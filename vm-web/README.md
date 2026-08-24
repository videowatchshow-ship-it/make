# 가상서버 웹 제어판 (win-vm 시작/정지)

웹페이지 버튼으로 GCP VM `win-vm`을 켜고 끕니다. (핸드폰 접속 가능)

구조: **웹 버튼 → 이 서버(Cloud Run) → GCP Compute API**
서버가 GCP 권한을 들고 있고, 웹은 비밀번호로 잠급니다.

## 파일
- `server.js` — Node/Express 백엔드 (start/stop/status API)
- `public/index.html` — 버튼 UI
- `Dockerfile`, `package.json`

## 배포 (Cloud Run, 한 번만)

```bash
cd vm-web

# 1) 배포 (소스에서 바로 빌드)
gcloud run deploy vm-panel \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT=quantum-bonus-455522-b4,VM_ZONE=asia-northeast3-a,VM_NAME=win-vm,PANEL_PASSWORD=원하는비밀번호

# 2) Cloud Run 서비스 계정에 VM 제어 권한 부여
#    (배포 후 나오는 서비스계정 이메일을 SA 에 넣으세요)
gcloud projects add-iam-policy-binding quantum-bonus-455522-b4 \
  --member="serviceAccount:$(gcloud run services describe vm-panel --region asia-northeast3 --format='get(spec.template.spec.serviceAccountName)')" \
  --role="roles/compute.instanceAdmin.v1"
```

배포 끝나면 나오는 URL(`https://vm-panel-xxxx.run.app`)로 접속 →
비밀번호 넣고 **시작/정지/상태확인** 버튼 사용.

## 로컬 테스트
```bash
cd vm-web
npm install
GCP_PROJECT=quantum-bonus-455522-b4 PANEL_PASSWORD=test node server.js
# http://localhost:8080  (gcloud auth application-default login 필요)
```

## 참고
- 상태확인 버튼 → 현재 상태 + 접속 IP 표시 (IP 바뀌어도 여기서 확인)
- 공식: https://cloud.google.com/run/docs/deploying-source-code
