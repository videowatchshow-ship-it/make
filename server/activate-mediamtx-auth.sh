#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MediaMTX 외부 인증(authMethod: http) 활성화 — 안전 롤아웃 스크립트
#
# 왜 deploy.sh 에 안 넣었나: MediaMTX 재시작은 지금 방송 중인 세션에 영향을 줄 수
# 있는 작업이라, 원클릭 배포에 자동으로 끼워넣지 않고 이 스크립트로 분리했다.
# 설정 자동 백업 → 교체 → 재시작 → 헬스체크(포트+인증콜백) → 실패 시 자동 롤백.
#
# 사용법 (서버에서 sudo 로):
#   sudo bash server/activate-mediamtx-auth.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

NEW_YML="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mediamtx.yml"
[ -f "$NEW_YML" ] || { echo "❌ $NEW_YML 없음 — 저장소 루트에서 실행했는지 확인"; exit 1; }

echo "== [1/5] 실행 중인 MediaMTX 설정 파일 찾기 =="
MTX_PID="$(pgrep -x mediamtx | head -1 || true)"
if [ -z "$MTX_PID" ]; then
  echo "❌ mediamtx 프로세스가 안 보임. 이미 죽어있는지 확인: ss -ltnup | grep -E '1935|8888|8889'"
  exit 1
fi
# 프로세스가 실행될 때 넘긴 인자에서 설정 파일 경로 추출 (예: mediamtx /opt/.../mediamtx.yml)
CUR_YML="$(tr '\0' '\n' < /proc/$MTX_PID/cmdline 2>/dev/null | grep -E '\.ya?ml$' | head -1)"
if [ -z "$CUR_YML" ]; then
  # 인자 없이 실행 중이면 MediaMTX 는 cwd 의 mediamtx.yml 을 읽는다
  CWD="$(readlink -f /proc/$MTX_PID/cwd 2>/dev/null || true)"
  [ -n "$CWD" ] && [ -f "$CWD/mediamtx.yml" ] && CUR_YML="$CWD/mediamtx.yml"
fi
if [ -z "$CUR_YML" ] || [ ! -f "$CUR_YML" ]; then
  echo "❌ 실행 중인 mediamtx 설정 파일 경로를 못 찾음 (pid=$MTX_PID)."
  echo "   수동 확인: ps -p $MTX_PID -o args= 그리고 ls -la /proc/$MTX_PID/cwd"
  exit 1
fi
echo "  발견: $CUR_YML (pid=$MTX_PID)"

echo "== [2/5] 백업 =="
BACKUP="${CUR_YML}.bak.$(date +%Y%m%d%H%M%S)"
cp "$CUR_YML" "$BACKUP"
echo "  백업: $BACKUP"

echo "== [3/5] 새 설정(외부 HTTP 인증) 적용 =="
cp "$NEW_YML" "$CUR_YML"

restart_mtx() {
  if systemctl is-active --quiet mediamtx 2>/dev/null; then
    systemctl restart mediamtx
  elif [ -x /etc/init.d/mediamtx ]; then
    service mediamtx restart
  else
    # systemd 유닛이 없는 경우: 기존 프로세스를 죽이고 같은 실행 커맨드로 재기동
    local exe; exe="$(readlink -f /proc/$MTX_PID/exe 2>/dev/null || command -v mediamtx)"
    kill "$MTX_PID" 2>/dev/null; sleep 1
    nohup "$exe" "$CUR_YML" >/var/log/mediamtx.log 2>&1 &
    disown
  fi
}

echo "== [4/5] 재시작 =="
restart_mtx
sleep 2

echo "== [5/5] 헬스체크 =="
ok=1
ss -ltnup 2>/dev/null | grep -qE ':1935\s' || { echo "  ❌ RTMP(1935) 안 뜸"; ok=0; }
ss -ltnup 2>/dev/null | grep -qE ':8889\s' || { echo "  ❌ WHIP(8889) 안 뜸"; ok=0; }
ss -ltnup 2>/dev/null | grep -qE ':8888\s' || { echo "  ❌ HLS(8888) 안 뜸"; ok=0; }
# 외부인증 콜백이 릴레이 API 로 정확히 붙었는지: publish 토큰 없이 찌르면 401 이 정상(거부)
AUTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3000/api/mediamtx/auth \
  -H 'Content-Type: application/json' -d '{"action":"publish","path":"__healthcheck__","ip":"127.0.0.1"}' 2>/dev/null || echo 000)"
if [ "$AUTH_CODE" = "401" ]; then
  echo "  ✅ 외부인증 콜백 정상 응답(401=거부, 의도된 동작)"
else
  echo "  ❌ 외부인증 콜백 이상(code=$AUTH_CODE, 기대값 401) — 릴레이 API(:3000) 살아있는지 확인"
  ok=0
fi

if [ "$ok" = "1" ]; then
  echo ""
  echo "✅ 활성화 완료 — 시청/송출이 이제 로그인 세션에 묶입니다."
  echo "   되돌리려면: sudo cp $BACKUP $CUR_YML && sudo bash $0 --already-backed-up (또는 서비스 재시작)"
else
  echo ""
  echo "⚠️ 문제 발견 — 자동 롤백합니다."
  cp "$BACKUP" "$CUR_YML"
  restart_mtx
  sleep 2
  echo "   롤백 완료. 원래 설정(내부/공개 인증)으로 복구됨. 위 에러 메시지를 확인 후 다시 시도하세요."
  exit 1
fi
