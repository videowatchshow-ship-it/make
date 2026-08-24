# VM 제어 스크립트 (가상1번 = win-vm)

GCP(Google Cloud) 윈도우 서버 VM `win-vm`(서울 리전 `asia-northeast3-a`)을
켜고 끄는 스크립트입니다.

## 사전 준비
- 맥/PC에 `gcloud` CLI 설치 + 로그인 (`gcloud auth login`)
- 프로젝트 설정됨 (`quantum-bonus-455522-b4`)

## 사용법 (터미널)

```bash
# 시작 (+ 접속 IP 출력)
bash vm-control/vm1-start.sh

# 정지 (요금 절약)
bash vm-control/vm1-stop.sh
```

## 맥 바탕화면 버튼으로 쓰기

`.command` 파일로 만들면 더블클릭으로 실행됩니다:

```zsh
cp vm-control/vm1-start.sh ~/Desktop/가상1번-시작.command
cp vm-control/vm1-stop.sh  ~/Desktop/가상1번-정지.command
chmod +x ~/Desktop/가상1번-시작.command ~/Desktop/가상1번-정지.command
```

첫 실행 시 "확인되지 않은 개발자" 경고가 뜨면 파일 우클릭 → 열기 → 열기.

## 참고
- 껐다 켜면 외부 IP가 바뀔 수 있습니다. 시작 스크립트가 새 IP를 출력합니다.
- IP를 고정하려면 GCP 정적 외부 IP(static external IP)를 예약하세요.

## 공식 문서
- start: https://cloud.google.com/sdk/gcloud/reference/compute/instances/start
- stop: https://cloud.google.com/sdk/gcloud/reference/compute/instances/stop
- 윈도우 비번 재설정: https://cloud.google.com/compute/docs/instances/windows/creating-passwords-for-windows-instances
