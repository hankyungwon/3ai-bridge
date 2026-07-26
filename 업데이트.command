#!/bin/bash
# ============================================================
# 업데이트.command — 맥용 원클릭 업데이트
# 더블클릭하면 GitHub의 최신 버전을 내려받아 이 폴더에 덮어씁니다.
# 처음 실행할 때 맥이 막으면: 파일을 오른쪽 클릭 → "열기" 를 누르세요.
# 끝나면 크롬 chrome://extensions 에서 새로고침(⟳)만 누르세요.
# ============================================================
set -e
cd "$(dirname "$0")"

echo "3대장 브리지를 최신 버전으로 업데이트하는 중..."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -sSL -o "$tmp/main.zip" "https://github.com/hankyungwon/3ai-bridge/archive/refs/heads/main.zip"
unzip -q "$tmp/main.zip" -d "$tmp"
cp -R "$tmp/3ai-bridge-main/." .

echo ""
echo "업데이트 완료!"
echo "이제 크롬 주소창에 chrome://extensions 를 입력하고"
echo "3대장 브리지 카드의 새로고침(⟳) 버튼을 누르세요."
