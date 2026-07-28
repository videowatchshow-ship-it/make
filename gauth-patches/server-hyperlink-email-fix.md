# server.js 하이퍼링크 이메일 복원 패치

## 문제
Excel 셀에 하이퍼링크(`mailto:xxx@gmail.com`)로 저장된 이메일을
SheetJS `sheet_to_json()`이 `cell.w`(표시 텍스트)만 읽어
`ibrahimaishatu227` 처럼 도메인이 유실됨 → 실패 큐로 빠짐.

## 프론트 수정 완료
`credential_manager.html` line 225 부근 — 동일 로직 적용 완료.

## 서버 수정 (수동 적용)
`server.js`의 `/api/upload-excels` 핸들러에서 `XLSX.read()` 직후,
`sheet_to_json()` 호출 **전에** 아래 코드를 삽입:

```js
// 하이퍼링크 셀 이메일 복원 (SheetJS Hyperlinks docs)
// mailto:xxx@gmail.com → cell.v/cell.w 에 전체 이메일 기록
wb.SheetNames.forEach(function(sn){
  var ws = wb.Sheets[sn];
  Object.keys(ws).forEach(function(k){
    if(k[0]==='!') return;
    var c = ws[k];
    if(c && c.l && c.l.Target){
      var t = String(c.l.Target).replace(/^mailto:/i,'');
      if(t.includes('@') && (!String(c.v||'').includes('@'))){
        c.v = t; c.w = t;
      }
    }
  });
});
```

## 적용 위치 찾기
```bash
# 프로덕션 서버에서
grep -n 'sheet_to_json\|upload-excels' server.js
```
`XLSX.read(buffer, ...)` 와 `sheet_to_json(...)` 사이에 삽입.

## 검증
업로드 후 `/api/accounts` 에서 이전에 실패 큐로 빠졌던
하이퍼링크 이메일(도메인 누락)이 `@gmail.com` 포함 상태로
정상 파싱되는지 확인.

## 참조
- [SheetJS Hyperlinks & Tooltips](https://docs.sheetjs.com/docs/csf/features/hyperlinks)
- [SheetJS Cell Object](https://docs.sheetjs.com/docs/csf/cell)
- [Excel RangeHyperlink API](https://learn.microsoft.com/en-us/office/vba/api/excel.range.hyperlinks)
