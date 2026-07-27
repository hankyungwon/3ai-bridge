#!/bin/bash
# ============================================================
# 업데이트.command — 맥용 원클릭 설치·업데이트
# 더블클릭하면 GitHub의 최신 버전을 내려받아 이 폴더에 덮어씁니다.
# (빈 폴더에서 실행하면 그 폴더가 곧 설치 폴더가 됩니다)
#
# ※ 맥 보안 경고("악성 코드가 없음을 확인할 수 없습니다")가 뜨면
#    "완료"를 누른 뒤 설치법.md의 "맥에서 보안 경고가 뜰 때"를 보세요.
#    가장 간단한 방법은 터미널 한 줄 설치입니다.
#
# 끝나면 크롬 chrome://extensions 에서 새로고침(⟳)만 누르세요.
# ============================================================
set -e
cd "$(dirname "$0")"

echo "AI 3대장 카페를 최신 버전으로 업데이트하는 중..."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -sSL -o "$tmp/main.zip" "https://github.com/hankyungwon/3ai-bridge/archive/refs/heads/main.zip"

# 압축 풀기: 맥 기본 도구(ditto)가 한글 파일명을 정확히 처리합니다.
# ditto 가 없는 환경이면 unzip 으로 대신합니다.
if command -v ditto >/dev/null 2>&1; then
  ditto -x -k "$tmp/main.zip" "$tmp"
else
  unzip -oq "$tmp/main.zip" -d "$tmp"
fi

cp -R "$tmp/3ai-bridge-main/." .
# 이 스크립트와 바로가기 앱의 실행 권한을 유지하고,
# 맥이 붙이는 격리 표시(보안 경고의 원인)를 걷어냅니다.
chmod +x "$0" "카페열기.app/Contents/MacOS/cafe" 2>/dev/null || true
xattr -dr com.apple.quarantine "카페열기.app" 2>/dev/null || true

echo ""
echo "업데이트 완료!"
echo "이제 크롬 주소창에 chrome://extensions 를 입력하고"
echo "'AI 3대장 카페' 카드의 새로고침(⟳) 버튼을 누르세요."
