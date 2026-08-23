@echo off
chcp 65001 >nul
echo ============================================
echo   Kiro 수리 스크립트 (삭제 아님)
echo   - MCP 53개 과부하 해제
echo   - 깨진 권한/설정 규칙 수리
echo   - 캐시 정리로 멈춤 해결
echo ============================================
echo.

echo [1/5] Kiro 프로세스 종료 (수리를 위해 잠시 종료)...
powershell -Command "Get-Process | Where-Object {$_.Name -match 'kiro'} | Stop-Process -Force -ErrorAction SilentlyContinue"
timeout /t 2 >nul
echo   - 종료 완료

echo [2/5] MCP 설정 백업 후 비활성화 (53개 과부하 원인 제거)...
if exist "%USERPROFILE%\.kiro\settings\mcp.json" (
    copy /Y "%USERPROFILE%\.kiro\settings\mcp.json" "%USERPROFILE%\.kiro\settings\mcp.json.backup" >nul
    echo {"mcpServers":{}}> "%USERPROFILE%\.kiro\settings\mcp.json"
    echo   - 글로벌 MCP 전부 비활성화. 백업: mcp.json.backup
) else (
    echo   - 글로벌 MCP 설정 없음
)
:: 프로젝트별 MCP 설정도 백업 후 비활성화
for /d /r "%USERPROFILE%\Desktop" %%d in (.kiro) do (
    if exist "%%d\settings\mcp.json" (
        copy /Y "%%d\settings\mcp.json" "%%d\settings\mcp.json.backup" >nul
        echo {"mcpServers":{}}> "%%d\settings\mcp.json"
        echo   - 프로젝트 MCP 비활성화: %%d
    )
)
for /d /r "%USERPROFILE%\Documents" %%d in (.kiro) do (
    if exist "%%d\settings\mcp.json" (
        copy /Y "%%d\settings\mcp.json" "%%d\settings\mcp.json.backup" >nul
        echo {"mcpServers":{}}> "%%d\settings\mcp.json"
        echo   - 프로젝트 MCP 비활성화: %%d
    )
)

echo [3/5] 깨진 설정 수리 (빈 문자열 규칙 제거)...
powershell -Command "$f='%APPDATA%\Kiro\User\settings.json'; if(Test-Path $f){ Copy-Item $f ($f+'.backup') -Force; $j=Get-Content $f -Raw | ConvertFrom-Json; if($j.'kiroAgent.trustedCommands'){ $j.'kiroAgent.trustedCommands' = @($j.'kiroAgent.trustedCommands' | Where-Object {$_ -ne ''}) }; if($j.'kiroAgent.agentIgnoreFiles'){ $j.'kiroAgent.agentIgnoreFiles' = @($j.'kiroAgent.agentIgnoreFiles' | Where-Object {$_ -ne ''}) }; $j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding UTF8; Write-Host '  - settings.json 수리 완료 (빈 규칙 제거, 백업: settings.json.backup)' } else { Write-Host '  - settings.json 없음' }"

echo [4/5] Kiro 캐시 정리 (멈춤 원인 제거)...
for %%p in (
    "%APPDATA%\Kiro\Cache"
    "%APPDATA%\Kiro\CachedData"
    "%APPDATA%\Kiro\GPUCache"
    "%APPDATA%\Kiro\Code Cache"
    "%APPDATA%\Kiro\Service Worker\CacheStorage"
) do (
    if exist %%p (
        rmdir /S /Q %%p 2>nul
        echo   - %%p 정리 완료
    )
)

echo [5/5] Kiro 재시작...
if exist "%LOCALAPPDATA%\Programs\Kiro\Kiro.exe" (
    start "" "%LOCALAPPDATA%\Programs\Kiro\Kiro.exe"
    echo   - Kiro 재시작 완료
) else (
    echo   - Kiro 실행 파일을 찾을 수 없음. 직접 실행하세요.
)

echo.
echo ============================================
echo   수리 완료
echo   - MCP 53개 경고: 사라짐 (전부 비활성화, 백업 있음)
echo   - 권한 설정 경고: 사라짐 (빈 규칙 제거)
echo   - 캐시 정리: 멈춤 현상 개선
echo.
echo   MCP 다시 켜려면: .kiro\settings\mcp.json.backup
echo   내용을 mcp.json에 복원하면 됨
echo ============================================
echo.
pause
