/**
 * gauth 프론트엔드 통계바 — 통합 리프레시 함수 (수정 A + B + C)
 * ------------------------------------------------------------------
 * 이 함수 하나로 기존 index.html 의 line 40~49 IIFE 를 대체합니다.
 *
 *   - 수정 A: accStats 앞에 "엑셀 파일 N장" 표시 (parse-report last_run.files)
 *   - 수정 B: 함수화 → 첫 로드 + 업로드 완료 후 재호출로 자동 갱신
 *   - 수정 C: 년/월별 그룹 표시 (parse-report last_run.by_date)
 *
 * 적용:
 *   1) 기존 IIFE (line 40~49) 를 이 함수 정의로 교체
 *   2) 함수 정의 직후 refreshAccStats();  // 첫 로드
 *   3) 업로드 완료 지점(line 175, appendLog('✅ 완료') 직후) 에 refreshAccStats();
 *   4) accStats 아래에 <div id="monthlyGroups"></div> 마크업 추가
 *
 * 의존: 유료 라이브러리 없음. 표준 fetch 만 사용 (MDN fetch API).
 */
async function refreshAccStats() {
  const bar = document.getElementById('accStats');
  const months = document.getElementById('monthlyGroups');

  // 두 엔드포인트를 병렬 fetch (no-store: 캐시된 값 대신 항상 최신)
  const [acc, rp] = await Promise.all([
    fetch('/api/accounts',      { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
    fetch('/api/parse-report',  { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
  ]);

  const lr     = (rp && rp.last_run) || {};
  const _files = lr.files || 0;                        // 수정 A: 업로드된 엑셀 파일 개수

  // ── 통계바 본문 ───────────────────────────────────────────────
  // 수정 A: "엑셀 파일 N장" 을 맨 앞에 붙이고, 기존 계정 통계는 그대로 이어붙임
  if (bar) {
    bar.innerHTML =
      '📄 엑셀 파일 <b style="color:#7dabff">' + _files + '</b>장 · ' +
      '📊 계정 원본 <b>'   + (acc.total   || 0) + '</b>개 · ' +
      '✅ 사용가능 <b>'    + (acc.usable  || 0) + '</b> · ' +
      '⚠️ 무효 <b>'       + (acc.invalid || 0) + '</b>';
  }

  // ── 년/월별 그룹 ─────────────────────────────────────────────
  // 수정 C: by_date = { "2026-07": 2091, "2026-06": 500, ... }
  if (months) {
    const byDate = lr.by_date || {};
    let html = '';
    Object.entries(byDate).sort().reverse().forEach(([ym, cnt]) => {
      html +=
        '<span style="margin:0 8px;padding:4px 10px;background:#161a20;border-radius:6px">' +
        ym + ': <b style="color:#3ddc84">' + cnt + '</b></span>';
    });
    months.innerHTML = html;
  }
}
