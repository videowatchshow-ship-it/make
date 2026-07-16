# 용어집

| 용어 | 뜻 |
|--|--|
| **아바타(avatar)** | 방송자 단위. 각 아바타는 자기 대상 목록과 스트림 경로(`/tak` 등)를 가진다. |
| **fan-out** | 한 입력 스트림을 여러 대상으로 동시에 복제 송출하는 것. 센트빔 릴레이의 핵심. |
| **릴레이(relay)** | 클라이언트의 1회 송출을 받아 여러 플랫폼으로 재전송하는 서버. (= Restream.io 방식) |
| **RTMP** | Real-Time Messaging Protocol. OBS/PRISM/FFmpeg가 쓰는 전통 송출 프로토콜. 포트 1935. |
| **RTMPS** | TLS로 암호화된 RTMP (예: Facebook). |
| **WHIP** | WebRTC-HTTP Ingestion Protocol (RFC 9725). 브라우저가 WebRTC로 서버에 송출할 때 쓰는 HTTP 시그널링. 포트 8889. |
| **HLS** | HTTP Live Streaming. 재생용(자체 사이트 `<video>` 임베드). 포트 8888. |
| **DTLS-SRTP** | WebRTC 미디어 암호화 표준(RFC 8826/8827). 송출 구간 기본 암호화. |
| **MediaMTX** | RTMP/WHIP/HLS를 한 바이너리로 처리하는 미디어 서버. publish 훅 제공. |
| **captureStream** | `<canvas>`를 `MediaStream`으로 캡처하는 브라우저 API. 씬 합성 결과를 송출 소스로 만든다. |
| **씬(scene)** | 캔버스 위 레이어(소스)들의 배치 상태. |
| **레이어(layer)** | 캔버스의 한 소스(카메라/화면/이미지/텍스트/웹). |
| **cover fit** | 원본 비율을 유지하며 캔버스를 꽉 채우고 넘치는 부분을 크롭하는 방식. |
| **locked 대상** | API로 삭제 불가한 필수 송출 대상. |
| **PWA** | Progressive Web App. 브라우저 웹을 홈화면 설치·오프라인 지원 앱처럼 만드는 표준. |
| **보안 컨텍스트** | HTTPS 또는 localhost/file. 카메라·마이크·Wake Lock 등 민감 API의 전제조건. |
| **PKCE** | OAuth 2.0 Proof Key for Code Exchange. RFC 9700이 모든 클라이언트에 요구. |
