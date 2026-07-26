@echo off
rem ============================================================
rem 업데이트.bat — 윈도우용 원클릭 업데이트
rem 더블클릭하면 GitHub의 최신 버전을 내려받아 이 폴더에 덮어씁니다.
rem 끝나면 크롬 chrome://extensions 에서 새로고침(둥근 화살표)만 누르세요.
rem ============================================================
chcp 65001 >nul
echo 3대장 브리지를 최신 버전으로 업데이트하는 중...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $dir=Split-Path -Parent '%~f0'; $tmp=Join-Path $env:TEMP '3ai-bridge-update'; if(Test-Path $tmp){Remove-Item $tmp -Recurse -Force}; New-Item -ItemType Directory -Path $tmp | Out-Null; $zip=Join-Path $tmp 'main.zip'; Invoke-WebRequest -Uri 'https://github.com/hankyungwon/3ai-bridge/archive/refs/heads/main.zip' -OutFile $zip; Expand-Archive -Path $zip -DestinationPath $tmp -Force; Copy-Item -Path (Join-Path $tmp '3ai-bridge-main\*') -Destination $dir -Recurse -Force; Remove-Item $tmp -Recurse -Force; Write-Host ''; Write-Host '업데이트 완료!'; Write-Host '이제 크롬 주소창에 chrome://extensions 를 입력하고'; Write-Host '3대장 브리지 카드의 새로고침(둥근 화살표) 버튼을 누르세요.'"
if errorlevel 1 echo 업데이트에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 보세요.
pause
