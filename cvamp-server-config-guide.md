# CVAmp 서버 수정 가이드 (5000 / 6003 포트)

## 파일 위치

```
📂 e:\CVAmp (5000번 포트)
├── app.py                    ← 백엔드 메인 (Flask 서버)
├── templates\index.html      ← 프론트엔드 (웹 UI)
├── cvamp\
│   ├── instance.py          ← 브라우저 봇 로직
│   ├── sites.py             ← YouTube 사이트 제어
│   ├── manager.py           ← 봇 관리자
│   └── proxy.py             ← 프록시 관리
├── proxy_hub.py             ← 프록시 수집/검증
└── proxy_fetcher.py         ← 프록시 다운로드

📂 e:\CVAmp3 (6003번 포트)
└── (위와 동일한 구조)
```

## 주요 수정 파일

| 파일 | 설명 | 수정 내용 예시 |
|------|------|--------------|
| `app.py` | 백엔드 API | 목표 시청자수, CPU 제한, 대기시간 |
| `templates\index.html` | 웹 UI | 버튼, 색상, 텍스트 |
| `cvamp\instance.py` | 브라우저 설정 | Timeout, Retry, Headless 모드 |
| `cvamp\sites.py` | YouTube 제어 | 광고 스킵 시간, 재생 확인 |
| `proxy_hub.py` | 프록시 설정 | 프록시 URL, 검증 로직 |

## 자주 수정하는 설정

### 1. app.py 설정 변경

```python
# 위치: e:\CVAmp\app.py (또는 e:\CVAmp3\app.py)

# 줄 170 근처
MAX_ALIVE = 50          # 동시 최대 봇 개수 (10~100)
CPU_LIMIT = 90          # CPU 제한 % (60~95)

# 줄 177 근처
log(f"⚠️ CPU {cpu}% - 23초 대기")  # 대기시간 (20~30초)
time.sleep(23)          # ← 이 숫자 변경

# 줄 26 근처 (포트 변경)
app.run(host="0.0.0.0", port=5000)  # ← 5000 또는 6003
```

### 2. instance.py 브라우저 설정

```python
# 위치: e:\CVAmp\cvamp\instance.py

# 줄 190 근처
headless=False,         # True로 변경하면 백그라운드 실행
```

### 3. sites.py YouTube 제어

```python
# 위치: e:\CVAmp\cvamp\sites.py

# 줄 45 근처
await page.wait_for_selector(...)  # Timeout 시간 변경
```

## 서버 재시작 명령어

```powershell
# 1. 5000번 서버 재시작
cd e:\CVAmp
python app.py

# 2. 6003번 서버 재시작
cd e:\CVAmp3
python app.py

# 3. 백그라운드 실행 (콘솔 닫아도 계속 실행)
cd e:\CVAmp
Start-Process python -ArgumentList "app.py" -NoNewWindow

# 4. 프로세스 확인
Get-Process python

# 5. 프로세스 종료 (PID 확인 후)
Stop-Process -Id [PID번호]
```

## 웹 접속 주소

- 5000번: http://localhost:5000
- 6003번: http://localhost:6003

## 서버 요약 (AI 전달용)

```
5000번 서버:
- 파일 위치: e:\CVAmp\app.py
- 실행 명령: cd e:\CVAmp && python app.py
- 웹 UI: http://localhost:5000
- 설정: MAX_ALIVE=50, CPU_LIMIT=90%, 대기시간=23초

6003번 서버:
- 파일 위치: e:\CVAmp3\app.py
- 실행 명령: cd e:\CVAmp3 && python app.py
- 웹 UI: http://localhost:6003
- 설정: 5000번과 동일

주요 수정 파일:
1. app.py - 백엔드 로직
2. templates\index.html - 프론트엔드
3. cvamp\instance.py - 브라우저 설정
4. cvamp\sites.py - YouTube 제어
```

코드 수정 후 반드시 서버 재시작 필요.
