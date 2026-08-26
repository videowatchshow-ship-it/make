@echo off
chcp 65001 >nul
echo ============================================
echo   Kiro AI 완전 삭제 스크립트 (최종판)
echo ============================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 관리자 권한으로 다시 실행합니다...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo [1/10] Kiro 프로세스 전부 종료...
powershell -Command "Get-Process | Where-Object {$_.Name -match 'kiro'} | Stop-Process -Force -ErrorAction SilentlyContinue"
echo   - Kiro 관련 프로세스 전부 종료 완료

echo [2/10] 공식 언인스톨러 실행...
if exist "%LOCALAPPDATA%\Programs\Kiro\unins000.exe" (
    "%LOCALAPPDATA%\Programs\Kiro\unins000.exe" /SILENT /NORESTART
    timeout /t 5 >nul
    echo   - 공식 언인스톨러 실행 완료
) else echo   - 공식 언인스톨러 없음

echo [3/10] Kiro 프로그램 폴더 삭제...
for %%p in (
    "%LOCALAPPDATA%\Programs\Kiro"
    "%PROGRAMFILES%\Kiro"
    "%PROGRAMFILES(x86)%\Kiro"
) do (
    if exist %%p (
        rmdir /S /Q %%p
        echo   - %%p 삭제 완료
    )
)

echo [4/10] Kiro 앱 데이터 전부 삭제...
for %%p in (
    "%APPDATA%\Kiro"
    "%LOCALAPPDATA%\Kiro"
    "%LOCALAPPDATA%\Kiro-updater"
) do (
    if exist %%p (
        rmdir /S /Q %%p
        echo   - %%p 삭제 완료
    )
)

echo [5/10] .kiro 글로벌 설정 + MCP + CLI + 서버 삭제...
for %%p in (
    "%USERPROFILE%\.kiro"
    "%USERPROFILE%\.kiro-server"
    "%USERPROFILE%\.kiro-cli"
) do (
    if exist %%p (
        rmdir /S /Q %%p
        echo   - %%p 삭제 완료
    )
)

echo [6/10] 프로젝트 안의 .kiro 폴더 전부 삭제...
echo   - 검색 중 (시간이 걸릴 수 있음)...
for /d /r "%USERPROFILE%" %%d in (.kiro) do (
    if exist "%%d" (
        echo   - 발견: %%d
        rmdir /S /Q "%%d"
        echo     삭제 완료
    )
)

echo [7/10] 레지스트리 Kiro 항목 전부 삭제...
powershell -Command "Get-ChildItem 'HKCU:\Software' -ErrorAction SilentlyContinue | Where-Object {$_.Name -match 'kiro'} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"
powershell -Command "Get-ChildItem 'HKLM:\Software' -ErrorAction SilentlyContinue | Where-Object {$_.Name -match 'kiro'} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"
powershell -Command "Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue | Where-Object {$_.Name -match 'kiro'} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"
powershell -Command "Get-ChildItem 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue | Where-Object {$_.Name -match 'kiro'} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"
echo   - 레지스트리 정리 완료

echo [8/10] 바로가기 전부 삭제 (이름 상관없이 Kiro 포함된 것 전부)...
powershell -Command "Get-ChildItem '%USERPROFILE%\Desktop' -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object { $sh = New-Object -ComObject WScript.Shell; $sc = $sh.CreateShortcut($_.FullName); if ($sc.TargetPath -match 'kiro' -or $_.Name -match 'kiro') { Remove-Item $_.FullName -Force; Write-Host ('  - 바탕화면 삭제: ' + $_.Name) } }"
powershell -Command "Get-ChildItem '%PUBLIC%\Desktop' -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object { $sh = New-Object -ComObject WScript.Shell; $sc = $sh.CreateShortcut($_.FullName); if ($sc.TargetPath -match 'kiro' -or $_.Name -match 'kiro') { Remove-Item $_.FullName -Force; Write-Host ('  - 공용 바탕화면 삭제: ' + $_.Name) } }"
powershell -Command "Get-ChildItem '%APPDATA%\Microsoft\Windows\Start Menu\Programs' -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object { $sh = New-Object -ComObject WScript.Shell; $sc = $sh.CreateShortcut($_.FullName); if ($sc.TargetPath -match 'kiro' -or $_.Name -match 'kiro') { Remove-Item $_.FullName -Force; Write-Host ('  - 시작메뉴 삭제: ' + $_.Name) } }"
powershell -Command "Get-ChildItem '%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs' -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object { $sh = New-Object -ComObject WScript.Shell; $sc = $sh.CreateShortcut($_.FullName); if ($sc.TargetPath -match 'kiro' -or $_.Name -match 'kiro') { Remove-Item $_.FullName -Force; Write-Host ('  - 공용 시작메뉴 삭제: ' + $_.Name) } }"
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kiro" (
    rmdir /S /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Kiro"
    echo   - 시작 메뉴 Kiro 폴더 삭제 완료
)
echo   - 바로가기 정리 완료

echo [9/10] PATH 환경변수에서 Kiro 제거...
powershell -Command "$p=[Environment]::GetEnvironmentVariable('PATH','User'); if($p -match 'kiro'){$np=($p.Split(';')|Where-Object{$_ -notmatch 'kiro'}) -join ';'; [Environment]::SetEnvironmentVariable('PATH',$np,'User'); Write-Host '  - PATH에서 Kiro 경로 제거 완료'} else {Write-Host '  - PATH에 Kiro 경로 없음'}"

echo [10/10] 최종 확인 - 남은 Kiro 파일 검색...
powershell -Command "$found=$false; @('%LOCALAPPDATA%\Programs\Kiro','%APPDATA%\Kiro','%LOCALAPPDATA%\Kiro','%USERPROFILE%\.kiro') | ForEach-Object { if(Test-Path $_){Write-Host ('  [경고] 아직 남아있음: '+$_); $found=$true} }; if(-not $found){Write-Host '  - 깨끗합니다. Kiro 흔적 없음.'}"

echo.
echo ============================================
echo   Kiro AI 완전 삭제 완료
echo ============================================
echo.
pause
