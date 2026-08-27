# trigger — GitHub Actions 트리거 파일

GitHub Actions 워크플로를 수동으로 트리거하기 위한 더미 파일 디렉토리.

## 파일

| 파일 | 역할 |
|------|------|
| `render-fix.txt` | Render 배포 픽스 트리거 (파일 변경 → workflow push 이벤트 발생) |

## 사용법

워크플로의 `on.push.paths`에 이 디렉토리 파일을 지정하면, 파일 내용 수정 후 push만으로 해당 워크플로를 실행할 수 있다. 코드 변경 없이 배포·패치 실행 시 사용.

## 원본 문서

- GitHub Actions `on.push`: <https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#push>
