# gauth 프론트엔드 수정 · 3건 (blind patch)

> 이 패치는 실제 배포 소스에 **직접 접근할 수 없는 환경**에서, 제공된 API 계약과
> 실측 라인 좌표를 기준으로 작성된 blind patch 입니다. DOM ID / 변수명이 실제와
> 다르면 아래 앵커를 기준으로 소폭 조정하세요. 유료 라이브러리 없음 · 표준 `fetch` 만 사용.

## 대상 파일
- 프론트: `index.html` (라이브 `https://gauth.cent-solution.online/`)
- 백엔드: `server.js` (Express) — **수정 C 에 한해** 응답에 `by_date` 필요 (아래 참고)

---

## 수정 A — accStats "엑셀 ?" → 실제 엑셀 파일 개수

`parse-report` 응답의 `last_run.files` 를 사용합니다.

**변경 전** (line 47 부근):
```js
'📊 엑셀 파일 원본 <b>0</b>개'
```
**변경 후** — 통계바 문자열 맨 앞에 추가:
```js
'📄 엑셀 파일 <b style="color:#7dabff">' + (_files || 0) + '</b>장 · '
```
값 확보(IIFE/함수 안):
```js
const rp = await fetch('/api/parse-report', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
const _files = rp?.last_run?.files || 0;
```

## 수정 B — 업로드 완료 후 accStats 자동 재fetch

기존 line 40~49 IIFE 를 **함수로 리팩터** 하고, 첫 로드 + 업로드 완료 지점에서 호출합니다.

```js
async function refreshAccStats() { /* 기존 IIFE 로직 */ }
refreshAccStats();          // ① 첫 로드
```
업로드 완료 직후 (line 175, `appendLog('✅ 완료')` 바로 다음):
```js
refreshAccStats();          // ② 업로드 후 새로고침 없이 갱신
```

## 수정 C — 년/월별 그룹 표시

`parse-report` 의 `last_run.by_date` 사용 (예: `{"2026-07": 2091, "2026-06": 500}`).

accStats 아래 마크업 추가:
```html
<div id="monthlyGroups" style="margin-top:8px"></div>
```
채우기(refreshAccStats 안):
```js
Object.entries(rp.last_run?.by_date || {}).sort().reverse().forEach(([ym, cnt]) => {
  html += `<span style="margin:0 8px;padding:4px 10px;background:#161a20;border-radius:6px">${ym}: <b style="color:#3ddc84">${cnt}</b></span>`;
});
```

> **백엔드 주의**: `GET /api/parse-report` 의 `last_run` 에 `by_date` 가 아직 없다면
> 프론트는 빈 상태로 렌더됩니다. `server.js` 의 parse-report 핸들러에서 마스터
> 계정을 추가일(년-월) 기준으로 집계해 `last_run.by_date` 로 내려주세요. 예:
> ```js
> const by_date = {};
> for (const a of master) {
>   const ym = (a.date || '').slice(0, 7);           // "YYYY-MM"
>   if (ym) by_date[ym] = (by_date[ym] || 0) + 1;
> }
> last_run.by_date = by_date;
> ```

---

## 통합본
세 수정을 한 함수로 합친 drop-in 구현: [`refreshAccStats.js`](./refreshAccStats.js).
기존 IIFE 를 이 함수로 교체 → `refreshAccStats()` 첫 호출 → 업로드 완료 후 재호출.

## 배포 & 검증
```bash
# 소스 위치 찾기 (SSH 가능한 서버에서)
grep -rl 'upload-excels' /var/www /root /home 2>/dev/null

# 배포 후 검증
curl -sk https://gauth.cent-solution.online/ | grep '엑셀 파일'
```
브라우저에서 엑셀 업로드 → **새로고침 없이** 통계바/월별 그룹이 갱신되는지 확인.
