@echo off
chcp 65001 >nul
echo ============================================
echo   Kiro AI 완전 삭제 스크립트
echo ============================================
echo.

:: 관리자 권한 확인
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 관리자 권한으로 다시 실행합니다...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [1/7] Kiro 프로세스 종료...
taskkill /F /IM Kiro.exe 2>nul
taskkill /F /IM kiro.exe 2>nul

echo [2/7] Kiro 프로그램 제거...
if exist "%LOCALAPPDATA%\Programs\Kiro" (
    rmdir /S /Q "%LOCALAPPDATA%\Programs\Kiro"
    echo   - Programs\Kiro 삭제 완료
) else (
    echo   - Programs\Kiro 없음
)

echo [3/7] Kiro 앱 데이터 삭제...
if exist "%APPDATA%\Kiro" (
    rmdir /S /Q "%APPDATA%\Kiro"
    echo   - AppData\Roaming\Kiro 삭제 완료
) else (
    echo   - AppData\Roaming\Kiro 없음
)
if exist "%LOCALAPPDATA%\Kiro" (
    rmdir /S /Q "%LOCALAPPDATA%\Kiro"
    echo   - AppData\Local\Kiro 삭제 완료
) else (
    echo   - AppData\Local\Kiro 없음
)

echo [4/7] Kiro 설정 폴더 삭제...
if exist "%USERPROFILE%\.kiro" (
    rmdir /S /Q "%USERPROFILE%\.kiro"
    echo   - .kiro 삭제 완료
) else (
    echo   - .kiro 없음
)

echo [5/7] Kiro MCP 설정 검색 및 삭제...
:: 프로젝트 폴더에 남은 .kiro 디렉토리 검색
echo   - C:\Users 하위 .kiro 폴더 검색 중...
for /d /r "%USERPROFILE%" %%d in (.kiro) do (
    if exist "%%d" (
        echo   - 발견: %%d
        rmdir /S /Q "%%d"
        echo     삭제 완료
    )
)

echo [6/7] 레지스트리 Kiro 항목 삭제...
reg delete "HKCU\Software\Kiro" /f 2>nul && echo   - HKCU\Software\Kiro 삭제 || echo   - HKCU\Software\Kiro 없음
reg delete "HKLM\Software\Kiro" /f 2>nul && echo   - HKLM\Software\Kiro 삭제 || echo   - HKLM\Software\Kiro 없음
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Kiro" /f 2>nul
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\Kiro" /f 2>nul

:: PATH에서 Kiro 제거
echo [7/7] 시작 메뉴 바로가기 삭제...
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kiro" (
    rmdir /S /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kiro"
    echo   - 시작 메뉴 바로가기 삭제 완료
)
if exist "%USERPROFILE%\Desktop\Kiro.lnk" (
    del /F "%USERPROFILE%\Desktop\Kiro.lnk"
    echo   - 바탕화면 바로가기 삭제 완료
)

echo.
echo ============================================
echo   Kiro AI 완전 삭제 완료
echo ============================================
echo.
pause
