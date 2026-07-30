#!/usr/bin/env python3
"""
tools/sync-app-versions.py — 앱 묶음 버전을 manifest.json 에 맞춥니다.

왜 필요한가:
  맥은 앱 아이콘을 "번들 ID + 버전"으로 캐시합니다(LaunchServices).
  아이콘 파일만 바꾸고 Info.plist 의 CFBundleVersion 을 그대로 두면,
  Finder 에는 새 아이콘이 보이는데 Dock 은 캐시된 옛 아이콘을 계속 씁니다.
  실제로 카페열기.app 이 v1.14.0 에 멈춰 있어 Dock 에서 옛 커피잔이
  되살아나는 일이 있었습니다.

  그래서 릴리스 때마다 두 앱의 버전을 확장 버전과 같이 올립니다.
  손으로 하면 또 빠뜨리므로 스크립트로 둡니다.

실행: python3 tools/sync-app-versions.py
"""

import json
import os
import re

여기 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(여기)

버전 = json.load(open("manifest.json", encoding="utf-8"))["version"]
앱들 = ["카페열기.app", "업데이트.app"]

for 앱 in 앱들:
    경로 = os.path.join(앱, "Contents", "Info.plist")
    글 = open(경로, encoding="utf-8").read()

    새글, 바뀜 = re.subn(
        r"(<key>CFBundleVersion</key>\s*\n\s*<string>)[^<]*(</string>)",
        r"\g<1>" + 버전 + r"\g<2>",
        글,
    )
    # 사람이 보는 버전(짧은 버전)도 함께 둡니다. 없으면 새로 넣습니다.
    if "CFBundleShortVersionString" in 새글:
        새글 = re.sub(
            r"(<key>CFBundleShortVersionString</key>\s*\n\s*<string>)[^<]*(</string>)",
            r"\g<1>" + 버전 + r"\g<2>",
            새글,
        )
    else:
        새글 = 새글.replace(
            "<key>CFBundleVersion</key>",
            "<key>CFBundleShortVersionString</key>\n\t<string>" + 버전 + "</string>\n\t<key>CFBundleVersion</key>",
            1,
        )

    open(경로, "w", encoding="utf-8").write(새글)
    print(f"{앱}: CFBundleVersion → {버전}" + ("" if 바뀜 else "  (CFBundleVersion 항목을 못 찾음!)"))

print("\n맥에서 Dock 아이콘이 그대로면 업데이트.app 이 실행될 때")
print("LaunchServices 를 새로 등록하므로 한 번 실행하면 갱신됩니다.")
