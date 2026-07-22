# Cloudflare API — 복붙 레퍼런스 (cent-solutions.info / CENTBEAM)

> 🔐 **토큰은 절대 이 파일/저장소에 넣지 말 것.** 셸 환경변수 `$CF_TOKEN` 으로만 사용.
> 계정: `videowatch.show@gmail.com` · 대시보드: https://dash.cloudflare.com
> 이 토큰 권한: ✅ DNS 편집(모든 zone) · ✅ 일부 zone 캐시 퍼지 · ❌ zone 생성 · ❌ SSL/방화벽/계정설정

```bash
export CF_TOKEN='본인_토큰'      # DNS Edit (all zones). 실행 후 rotate 권장, 커밋 금지.
```

---

## 0) cent-solutions.info 최초 연결 (한 번만)

토큰으로 **zone 생성이 안 되므로** 이 순서로:

1. **Cloudflare 대시보드** → `Add a Site` → `cent-solutions.info` → Free → 계속
2. 뜨는 **네임서버 2개** 복사 (예: `xxx.ns.cloudflare.com`, `yyy.ns.cloudflare.com`)
3. **GoDaddy** → `cent-solutions.info` → Nameservers → Change → "내 네임서버 사용" → 위 2개 입력 → Save
4. zone 이 **Active** 될 때까지 대기 (`dig +short NS cent-solutions.info` 에 cloudflare 나오면 완료)
5. 그 다음 아래 curl 로 A 레코드 추가

---

## 1) Zone 목록

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?per_page=50" \
  | python3 -c "import sys,json;[print(z['id'], z['name'], z['status']) for z in json.load(sys.stdin)['result']]"
```

특정 도메인의 Zone ID만:
```bash
ZONE_ID=$(curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=cent-solutions.info" \
  | python3 -c "import sys,json;r=json.load(sys.stdin)['result'];print(r[0]['id'] if r else 'NOT_FOUND')")
echo "ZONE_ID=$ZONE_ID"
```

---

## 2) DNS 레코드 조회

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?per_page=100" \
  | python3 -c "import sys,json;[print(r['id'], r['type'], r['name'], '->', r['content'], 'proxied='+str(r['proxied'])) for r in json.load(sys.stdin)['result']]"
```

특정 이름만 (예: A 레코드):
```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=cent-solutions.info"
```

---

## 3) A 레코드 추가

> ⚠️ **`proxied:false` (회색 구름) 필수** — WebRTC(WHIP) 송출·certbot 발급이 CF 프록시를 못 뚫음.

루트(@) → 서버:
```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"A","name":"cent-solutions.info","content":"34.104.233.35","ttl":300,"proxied":false,"comment":"CENTBEAM studio"}'
```

www:
```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"A","name":"www","content":"34.104.233.35","ttl":300,"proxied":false}'
```

(서브도메인 studio 로 하고 싶으면 `"name":"studio"`)

---

## 4) A 레코드 수정

먼저 레코드 ID 조회 후 PUT:
```bash
REC_ID=$(curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=cent-solutions.info" \
  | python3 -c "import sys,json;r=json.load(sys.stdin)['result'];print(r[0]['id'] if r else '')")

curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$REC_ID" \
  -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"A","name":"cent-solutions.info","content":"34.104.233.35","ttl":300,"proxied":false}'
```
> 일부 필드만 바꾸려면 `PATCH` 사용 가능 (같은 URL, 바꿀 필드만 body에).

---

## 5) DNS 레코드 삭제

```bash
curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$REC_ID" \
  -H "Authorization: Bearer $CF_TOKEN"
```

---

## 확인

```bash
dig +short cent-solutions.info          # 34.104.233.35
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A" \
  | python3 -c "import sys,json;[print(r['name'], r['content'], 'proxied='+str(r['proxied'])) for r in json.load(sys.stdin)['result']]"
```

DNS 전파 후 → 서버에서 `docs/DEPLOYMENT.md §0.C` (Apache vhost + certbot) → 폰에서 `https://cent-solutions.info/studio.html`.

---

## 공식 문서 (2026-07 유효)
- REST API: https://developers.cloudflare.com/api/
- DNS records 목록: https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-list-dns-records

> ⚠️ 이 저장소(this session)의 컨테이너는 네트워크 정책상 `api.cloudflare.com` 이 차단(403)돼 있어 여기서는 위 curl이 실행되지 않는다. **API가 열린 세션/로컬 맥에서 실행할 것.**
