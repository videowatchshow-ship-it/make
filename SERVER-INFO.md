# 서버 인프라 정보

## GCP 프로젝트

- **프로젝트 ID**: `quantum-bonus-455522-b4`
- **프로젝트 번호**: `956283750273`

## VM 인스턴스

| 이름 | 리전 | 외부 IP | 타입 | 용도 |
|------|------|---------|------|------|
| my-site-1 | asia-northeast1-a (도쿄) | 34.104.233.35 | e2-standard-2 | 참교육 메인 사이트 |
| win-vm | asia-northeast3-a (서울) | (동적) | — | Windows VM |
| bot-server-1 | asia-east1-b | 34.80.236.138 | e2-medium | 봇 서버 |
| bot-server-2 | asia-northeast1-b | 34.84.56.148 | e2-medium | 봇 서버 |
| bot-server-3 | asia-southeast2-a | 34.50.64.10 | e2-medium | 봇 서버 |
| gucci-yanolza | asia-southeast1-b | 35.247.130.253 | e2-standard-2 | 야놀자 |
| my-site-jkt | asia-southeast2-a | — | — | 자카르타 (중지) |

## my-site-1 (메인 사이트)

- **도메인**: `xn--9d0bw2fjtyymch7de9d.info`
- **서버 경로**: `/var/www/sites/chamgyo/`
- **OS**: Debian 6.1 (cloud-amd64)
- **DB**: MariaDB, `db_chamgyo`, user `root`
- **GitHub 레포**: `videowatchshow-ship-it/chamgyo`

### mode-a/03 (멀티라이브 시스템)

- **경로**: `/var/www/sites/chamgyo/public/admin/mode-a/03/`
- **URL**: `https://xn--9d0bw2fjtyymch7de9d.info/admin/mode-a/03/`
- **기능**: YouTube 멀티채널 동시 라이브 송출 + 채팅

### YouTube 채널 현황

- **총 등록**: 64개 (active 20, deleted 42, suspended 2)
- **토큰**: 22개 (프로젝트1: 11개, 프로젝트4: 11개)
- **invalid_grant**: tmtiling(프로젝트1), gracejohnst(프로젝트1)

### OAuth 프로젝트

| ID | 프로젝트 번호 | 출처 |
|----|--------------|------|
| primary | 956283750273 | quantum-bonus (기본) |
| 1 | 770149975646 | rhkdrh999-wp-6862 |
| 2 | 469873125034 | chamgyo-client2 |
| 3 | 441272345171 | chamgyo-client3 |
| 4 | — | DB gucci_oauth_clients |

### 핵심 DB 테이블

| 테이블 | 용도 |
|--------|------|
| gucci_yt_channels | YouTube 채널 목록 (64개) |
| gucci_yt_channel_tokens | OAuth 토큰 (22개) |
| gucci_oauth_clients | OAuth 클라이언트 설정 |

### SSH 접속

```bash
# GCP 콘솔 브라우저 SSH (권장)
# https://console.cloud.google.com/compute/instances?project=quantum-bonus-455522-b4
# my-site-1 옆 SSH 버튼 클릭

# 또는 gcloud CLI
gcloud compute ssh root@my-site-1 --zone=asia-northeast1-a --project=quantum-bonus-455522-b4
```

## win-vm (Windows VM 제어)

- **리전**: asia-northeast3-a (서울)
- **제어 스크립트**: `vm-control/vm1-start.sh`, `vm1-stop.sh`
- **웹 제어판**: `vm-web/` (Cloud Run 배포용)
- **배포 스크립트**: `vm-web/deploy.sh`

## 기타 GCP 프로젝트

| 프로젝트 ID | 이름 | 용도 |
|-------------|------|------|
| chamgyo-client2 | chamgyo-client2 | OAuth 프로젝트 2 |
| chamgyo-client3 | chamgyo-client3 | OAuth 프로젝트 3 |
| gucci-yanolza-2026 | gucci-yanolza | 야놀자 |
| nodetube-platform | NodeTube-Platform | NodeTube |
| everyoneslink-2026 | everyoneslink-2026 | 에브리원즈링크 |
