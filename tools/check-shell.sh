#!/bin/bash
# tools/check-shell.sh — 셸 스크립트 안전 검사
#
# bash 는 변수 이름에 영문·숫자·밑줄만 허용합니다. 한글 변수 이름을 쓰면
# 실행하는 순간 "No such file or directory" 로 죽습니다.
# 이 프로젝트에서 실제로 두 번 겪은 문제라, 검사기로 남깁니다.
#
# 사용법: ./tools/check-shell.sh 파일1 파일2 ...
BAD=0
for f in "$@"; do
  if grep -nP '^\s*[가-힣][가-힣A-Za-z0-9_]*=' "$f" 2>/dev/null; then
    echo "  ↑ $f : 한글 변수 이름은 bash 에서 동작하지 않습니다"
    BAD=1
  fi
  bash -n "$f" || BAD=1
done
if [ "$BAD" = "0" ]; then echo "셸 검사 통과 ($# 개 파일)"; fi
exit $BAD
