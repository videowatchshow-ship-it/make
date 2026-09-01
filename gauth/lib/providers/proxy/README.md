# 프록시 시스템

## 파일 구조

| 파일 | 역할 |
|------|------|
| `fetch_free.js` | GitHub 무료 SOCKS5 리스트 수집 |
| `verify_proxies.js` | YouTube TCP 연결 사전 검증 (socks 라이브러리) |
| `index.js` | 프록시 풀 로드 + 라운드로빈 |

---

## 의존 라이브러리

| 패키지 | 버전 | GitHub |
|--------|------|--------|
| socks | ^2.8.9 | [JoshGlazebrook/socks](https://github.com/JoshGlazebrook/socks) |

---

## ip:port 파싱 정규식 (전 파일 공통)

```
/^\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}$/
```

- `\d{1,3}(?:\.\d{1,3}){3}` — IPv4 4옥텟
- `:\d{2,5}` — 포트 2~5자리
- `^...$` — 줄 전체 일치 (ip:port:user:pass 같은 인증 프록시 자동 제외)

---

## verify_proxies.js 핵심 코드

공식 README 예제 원본 (https://github.com/JoshGlazebrook/socks):

```javascript
const { SocksClient } = require('socks');

const options = {
  proxy: {
    host: '159.203.75.200',
    port: 1080,
    type: 5
  },

  command: 'connect',

  destination: {
    host: '192.30.253.113',
    port: 80
  }
};

(async () => {
  try {
    const info = await SocksClient.createConnection(options);
    console.log(info.socket);
  } catch (err) {
    console.error(err);
  }
})();
```

실제 적용 — destination을 `www.youtube.com:443`, timeout `6000ms`:

```javascript
const options = {
  proxy: { host, port: Number(port), type: 5 },
  command: 'connect',
  destination: { host: 'www.youtube.com', port: 443 },
  timeout: 6000
};
try {
  const info = await SocksClient.createConnection(options);
  info.socket.destroy();  // TCP 연결만 확인, 데이터 송수신 불필요
  return true;
} catch (err) {
  return false;
}
```

---

## 사용법

### 1. 수집 + 검증 한 번에
```bash
node verify_proxies.js
# → proxy_pool.json 에 YouTube 통과 프록시만 저장
```

### 2. 기존 txt 파일 검증
```bash
node verify_proxies.js /path/to/proxies.txt
# 파일 형식: 한 줄에 ip:port
```

### 3. 수집만 (검증 없이)
```bash
node fetch_free.js
# → proxy_pool.json 에 최대 200개 랜덤 저장 (검증 없음)
```

---

## 프록시 소스 (fetch_free.js)

| 이름 | URL | 갱신 주기 |
|------|-----|-----------|
| proxifly | https://github.com/proxifly/free-proxy-list | 5분 |
| TheSpeedX | https://github.com/TheSpeedX/PROXY-List | 매일 |
| vakhov | https://github.com/vakhov/fresh-proxy-list | 5~20분 |

---

## ERR_INVALID_AUTH_CREDENTIALS 원인

- Chromium이 `--proxy-server=socks5://host:port` 로 SOCKS5 프록시 사용 시
- 프록시 서버가 username/password 인증을 요구하면 발생
- 무료 공개 프록시 중 일부가 유료 전용 서버이거나 인증 전용으로 변경된 것
- **해결**: `verify_proxies.js` 실행 후 통과한 것만 pool에 등록 → 이 오류 발생 비율 대폭 감소

---

## 검증 파라미터

| 상수 | 값 | 설명 |
|------|----|------|
| `CONCURRENCY` | 150 | 동시 검증 수 |
| `TIMEOUT_MS` | 6000 | 프록시당 타임아웃 (ms) |
| `DEST_HOST` | www.youtube.com | 검증 대상 호스트 |
| `DEST_PORT` | 443 | 검증 대상 포트 |
| `MAX_SAVE` | 500 | proxy_pool.json 최대 저장 수 |
