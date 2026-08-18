#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理 web 构建产物目录 static/assets 中未被 index.html 引用的旧文件。
（vite.config.js 设了 emptyOutDir:false，每次 build 会留下历史散落 chunk，需定期清理）
用法: python clean_static.py [static_dir]
"""
import os
import re
import glob
import sys


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "."
    if not os.path.isfile(os.path.join(base, "index.html")):
        # 默认指向 backend/static
        cand = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "static")
        if os.path.isfile(os.path.join(cand, "index.html")):
            base = cand
    html = open(os.path.join(base, "index.html"), encoding="utf-8").read()
    refs = {
        os.path.join(base, "assets", m)
        for m in re.findall(r'(?:src|href)="\./assets/([^"]+)"', html)
    }
    assets_dir = os.path.join(base, "assets")
    allf = glob.glob(os.path.join(assets_dir, "*"))
    kept = []
    removed = []
    for f in allf:
        if f in refs:
            kept.append(os.path.basename(f))
        else:
            os.remove(f)
            removed.append(os.path.basename(f))
    print("保留(被引用):", kept)
    print(f"已清理 {len(removed)} 个旧文件，目录剩余 {len(kept)} 个")
    if removed:
        print("删除:", removed)


if __name__ == "__main__":
    main()
