#!/usr/bin/env python3
"""fonts/NanumSquareNeo-Variable.woff2 를 base64로 css/fonts.css 에 내장한다.

폰트를 바꾸거나 업데이트할 때만 실행:  python3 tools/embed_font.py
(웹서버 MIME 설정(.woff2)이 없어도, file:// 로 열어도 폰트가 뜨도록 CSS 안에 직접 넣는 방식)
"""
import base64
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src = root / "fonts" / "NanumSquareNeo-Variable.woff2"
dst = root / "css" / "fonts.css"

b64 = base64.b64encode(src.read_bytes()).decode("ascii")
dst.write_text(
    "/* 자동 생성 파일 — 직접 수정하지 마세요. (tools/embed_font.py) */\n"
    "@font-face {\n"
    "  font-family: 'NanumSquareNeo-Variable';\n"
    "  font-weight: 100 900;\n"
    "  font-style: normal;\n"
    "  font-display: swap;\n"
    f"  src: url(data:font/woff2;base64,{b64}) format('woff2');\n"
    "}\n",
    encoding="utf-8",
)
print(f"wrote {dst.relative_to(root)} ({dst.stat().st_size:,} bytes) from {src.name} ({src.stat().st_size:,} bytes)")
