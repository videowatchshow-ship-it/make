@echo off
chcp 65001 >nul
echo ============================================
echo   Kiro AI 완전 삭제 스크립트 (강화판)
echo ============================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 관리자 권한으로 다시 실행합니다...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [1/10] Kiro 프로세스 전부 종료...
taskkill /F /IM Kiro.exe 2>nul
taskkill /F /IM kiro.exe 2>nul
taskkill /F /IM "Kiro Helper.exe" 2>nul
taskkill /F /IM "Kiro Helper (GPU).exe" 2>nul
taskkill /F /IM "Kiro Helper (Renderer).exe" 2>nul
taskkill /F /IM "Kiro Helper (Plugin).exe" 2>nul

echo [2/10] 공식 언인스톨러 실행...
if exist "%LOCALAPPDATA%\Programs\Kiro\unins000.exe" (
    echo   - 공식 언인스톨러 발견, 실행 중...
    "%LOCALAPPDATA%\Programs\Kiro\unins000.exe" /SILENT /NORESTART
    timeout /t 5 >nul
)

echo [3/10] Kiro 프로그램 폴더 삭제...
if exist "%LOCALAPPDATA%\Programs\Kiro" (
    rmdir /S /Q "%LOCALAPPDATA%\Programs\Kiro"
    echo   - Programs\Kiro 삭제 완료
) else echo   - Programs\Kiro 없음
if exist "%PROGRAMFILES%\Kiro" (
    rmdir /S /Q "%PROGRAMFILES%\Kiro"
    echo   - Program Files\Kiro 삭제 완료
) else echo   - Program Files\Kiro 없음
if exist "%PROGRAMFILES(x86)%\Kiro" (
    rmdir /S /Q "%PROGRAMFILES(x86)%\Kiro"
    echo   - Program Files(x86)\Kiro 삭제 완료
) else echo   - Program Files(x86)\Kiro 없음

echo [4/10] Kiro 앱 데이터 삭제 (Roaming + Local + Cache)...
if exist "%APPDATA%\Kiro" (
    rmdir /S /Q "%APPDATA%\Kiro"
    echo   - AppData\Roaming\Kiro 삭제 완료
) else echo   - AppData\Roaming\Kiro 없음
if exist "%LOCALAPPDATA%\Kiro" (
    rmdir /S /Q "%LOCALAPPDATA%\Kiro"
    echo   - AppData\Local\Kiro 삭제 완료
) else echo   - AppData\Local\Kiro 없음
if exist "%LOCALAPPDATA%\Kiro-updater" (
    rmdir /S /Q "%LOCALAPPDATA%\Kiro-updater"
    echo   - Kiro-updater 삭제 완료
) else echo   - Kiro-updater 없음

echo [5/10] Kiro 글로벌 설정 (.kiro) 삭제...
if exist "%USERPROFILE%\.kiro" (
    rmdir /S /Q "%USERPROFILE%\.kiro"
    echo   - %USERPROFILE%\.kiro 삭제 완료
) else echo   - .kiro 없음

echo [6/10] Kiro 확장 + 서버 데이터 삭제...
if exist "%USERPROFILE%\.kiro-server" (
    rmdir /S /Q "%USERPROFILE%\.kiro-server"
    echo   - .kiro-server 삭제 완료
) else echo   - .kiro-server 없음
if exist "%USERPROFILE%\.kiro-cli" (
    rmdir /S /Q "%USERPROFILE%\.kiro-cli"
    echo   - .kiro-cli 삭제 완료
) else echo   - .kiro-cli 없음

echo [7/10] 모든 프로젝트 안의 .kiro 폴더 삭제...
echo   - 사용자 폴더 전체 검색 중 (시간이 걸릴 수 있음)...
for /d /r "%USERPROFILE%" %%d in (.kiro) do (
    if exist "%%d" (
        echo   - 발견: %%d
        rmdir /S /Q "%%d"
        echo     삭제 완료
    )
)

echo [8/10] 레지스트리 Kiro 항목 전부 삭제...
reg delete "HKCU\Software\Kiro" /f 2>nul && echo   - HKCU\Software\Kiro 삭제 || echo   - HKCU\Software\Kiro 없음
reg delete "HKLM\Software\Kiro" /f 2>nul && echo   - HKLM\Software\Kiro 삭제 || echo   - HKLM\Software\Kiro 없음
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Kiro" /f 2>nul
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Kiro" /f 2>nul
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{kiro}" /f 2>nul
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\{kiro}" /f 2>nul
echo   - Uninstall 레지스트리 정리 완료

echo [9/10] 바로가기 전부 삭제...
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kiro" (
    rmdir /S /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kiro"
    echo   - 시작 메뉴 Kiro 폴더 삭제 완료
)
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kiro.lnk" (
    del /F "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kiro.lnk"
    echo   - 시작 메뉴 Kiro.lnk 삭제 완료
)
if exist "%USERPROFILE%\Desktop\Kiro.lnk" (
    del /F "%USERPROFILE%\Desktop\Kiro.lnk"
    echo   - 바탕화면 바로가기 삭제 완료
)
if exist "%PUBLIC%\Desktop\Kiro.lnk" (
    del /F "%PUBLIC%\Desktop\Kiro.lnk"
    echo   - 공용 바탕화면 바로가기 삭제 완료
)

echo [10/10] PATH 환경변수에서 Kiro 제거...
powershell -Command "$p=[Environment]::GetEnvironmentVariable('PATH','User'); if($p -match 'kiro'){$np=($p.Split(';')|Where-Object{$_ -notmatch 'kiro'}) -join ';'; [Environment]::SetEnvironmentVariable('PATH',$np,'User'); Write-Host '  - PATH에서 Kiro 경로 제거 완료'} else {Write-Host '  - PATH에 Kiro 경로 없음'}"

echo.
echo ============================================
echo   Kiro AI 완전 삭제 완료 (10/10)
echo ============================================
echo.
echo   삭제 항목:
echo     - Kiro 프로세스 (Helper 포함)
echo     - 공식 언인스톨러
echo     - Programs / Program Files 설치 폴더
echo     - AppData (Roaming + Local + Updater)
echo     - .kiro 글로벌 설정 + MCP
echo     - .kiro-server / .kiro-cli
echo     - 프로젝트별 .kiro 폴더
echo     - 레지스트리 전체
echo     - 바로가기 (시작메뉴 + 바탕화면)
echo     - PATH 환경변수
echo.
pause
