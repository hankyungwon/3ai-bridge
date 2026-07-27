#!/bin/bash
# ============================================================
# 카페열기.command — 맥용 바로가기
# 더블클릭하면 크롬을 켜고 AI 3대장 카페를 엽니다.
#  - 크롬이 꺼져 있으면: 크롬을 켜면 확장이 알아서 카페를 엽니다
#    (설정 > 크롬 시작 > "크롬을 켜면 자동으로 열기"가 켜져 있어야 함)
#  - 크롬이 이미 켜져 있으면: 크롬을 앞으로 가져오고 Option+3 을 눌러 줍니다
#    (이때 처음 한 번은 "손쉬운 사용" 권한 허용이 필요할 수 있습니다.
#     허용하기 싫으면 크롬 화면에서 직접 Option+3 을 누르셔도 똑같습니다)
#
# Dock에 넣어 두려면: 이 파일을 Dock 오른쪽(휴지통 옆) 영역으로 끌어다 놓으세요.
# ============================================================

if pgrep -x "Google Chrome" >/dev/null 2>&1; then
  echo "크롬이 이미 켜져 있습니다 — 카페를 엽니다..."
  osascript -e 'tell application "Google Chrome" to activate' \
            -e 'delay 0.4' \
            -e 'tell application "System Events" to key code 20 using option down' \
            >/dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "자동 단축키를 쓸 수 없습니다. 크롬 화면에서 Option+3 을 눌러 주세요."
    echo "(시스템 설정 > 개인정보 보호 및 보안 > 손쉬운 사용 에서 허용하면 자동으로 됩니다)"
  fi
else
  echo "크롬을 실행합니다 — 잠시 후 AI 3대장 카페가 열립니다."
  open -a "Google Chrome"
fi
