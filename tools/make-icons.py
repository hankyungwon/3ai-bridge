#!/usr/bin/env python3
"""
tools/make-icons.py — 아이콘 생성기 (삼지창)

세 대장을 세 갈래로 나타냅니다. 포세이돈의 삼지창을 떠올리게 하되
날카롭지 않게, 끝을 둥글게 마감하고 자루에 가로 매듭을 하나 두어
차분하고 신비로운 인상을 냅니다.

만드는 것:
  icons/icon128.png                        확장 아이콘
  카페열기.app/Contents/Resources/icon.icns  카페 열기 (삼지창)
  업데이트.app/Contents/Resources/icon.icns  업데이트 (삼지창 + NEW)

실행: python3 tools/make-icons.py
필요: Pillow  (pip install Pillow)
"""

from PIL import Image, ImageDraw, ImageFont
import struct, io, os

청록 = (34, 184, 207, 255)
먹 = (23, 25, 29, 255)
흰 = (255, 255, 255, 255)


def 베지어(p0, p1, p2, n=90):
    return [
        (
            (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
            (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
        )
        for t in [i / n for i in range(n + 1)]
    ]


def 삼지창(size, 뱃지=None, 위로올림=0.0):
    """size 픽셀 아이콘 한 장. 뱃지에 글자를 주면 위쪽에 함께 새깁니다."""
    S = size * 5  # 5배로 그린 뒤 줄여 가장자리를 곱게
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=먹)

    선굵기 = max(3, int(S * 0.040))
    cx = S * 0.5
    올림 = S * 위로올림

    def 선(점들, 굵기=None):
        d.line([(x, y) for x, y in 점들], fill=청록, width=굵기 or 선굵기, joint="curve")

    def 마감(x, y, r):
        d.ellipse([x - r, y - r, x + r, y + r], fill=청록)

    바깥끝 = S * 0.17 - 올림
    가운데끝 = S * 0.10 - 올림
    바깥x = S * 0.215
    그릇y = S * 0.40 - 올림

    # 세 갈래를 받치는 초승달 — 우아함의 핵심
    선(베지어(
        (cx - 바깥x, 그릇y - S * 0.02),
        (cx, 그릇y + S * 0.135),
        (cx + 바깥x, 그릇y - S * 0.02),
    ))

    # 좌우 갈래
    for 방향 in (-1, 1):
        x = cx + 방향 * 바깥x
        선([(x, 바깥끝), (x, 그릇y - S * 0.02)])
        마감(x, 바깥끝, 선굵기 * 0.45)

    # 가운데 창날 — 가장 높이 서서 자루로 이어짐
    선([(cx, 가운데끝), (cx, S * 0.86 - 올림 * 0.4)])
    마감(cx, 가운데끝, 선굵기 * 0.5)

    # 자루의 가로 매듭
    y = S * 0.66 - 올림 * 0.6
    폭 = S * 0.075
    선([(cx - 폭, y), (cx + 폭, y)], 굵기=max(2, int(S * 0.028)))

    if 뱃지:
        글꼴 = None
        for 후보 in (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ):
            if os.path.exists(후보):
                글꼴 = ImageFont.truetype(후보, int(S * 0.15))
                break
        if 글꼴 is None:
            글꼴 = ImageFont.load_default()
        bb = d.textbbox((0, 0), 뱃지, font=글꼴)
        d.text(
            (cx - (bb[2] - bb[0]) / 2 - bb[0], S * 0.865 - (bb[3] - bb[1]) / 2 - bb[1]),
            뱃지,
            font=글꼴,
            fill=흰,
        )

    return im.resize((size, size), Image.LANCZOS)


def icns만들기(경로, 뱃지=None, 위로올림=0.0):
    크기표 = {"icp4": 16, "icp5": 32, "icp6": 64, "ic07": 128, "ic08": 256, "ic09": 512}
    조각 = b""
    for 종류, 크기 in 크기표.items():
        buf = io.BytesIO()
        삼지창(크기, 뱃지, 위로올림).save(buf, format="PNG")
        자료 = buf.getvalue()
        조각 += 종류.encode() + struct.pack(">I", len(자료) + 8) + 자료
    open(경로, "wb").write(b"icns" + struct.pack(">I", len(조각) + 8) + 조각)
    print("만듦:", 경로)


if __name__ == "__main__":
    여기 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(여기)
    삼지창(128).save("icons/icon128.png")
    print("만듦: icons/icon128.png")
    icns만들기("카페열기.app/Contents/Resources/icon.icns")
    # 업데이트는 같은 삼지창에 NEW 를 새겨 한눈에 갈리게 (자루를 살짝 올림)
    icns만들기("업데이트.app/Contents/Resources/icon.icns", 뱃지="NEW", 위로올림=0.05)
