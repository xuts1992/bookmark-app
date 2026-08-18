#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 B 站全站热门榜抓取视频，写入本地 bookmark-app 数据库（作为视频收藏）。
用法:
  python fetch_bilibili.py --inspect        # 只打印前 2 条字段，不入库
  python fetch_bilibili.py                  # 抓取前 20 条并 POST 到后端
  python fetch_bilibili.py --count 10 --base http://localhost:9000
"""
import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request

RANK_URL = "https://api.bilibili.com/x/web-interface/ranking/v2"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
REFERER = "https://www.bilibili.com"


def http_get(url, retries=3):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": REFERER})
    last = None
    for _ in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa
            last = e
            time.sleep(1.5)
    raise RuntimeError(f"GET 失败: {last}")


def http_post(url, payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": UA, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def clean_text(s):
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", "", s)        # 去掉 <em class="keyword"> 等标签
    s = html.unescape(s)                 # &amp; -> &
    return s.strip()


def fmt_duration(sec):
    try:
        sec = int(sec)
    except Exception:  # noqa
        return ""
    if sec <= 0:
        return ""
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def to_https(u):
    if u and u.startswith("http://"):
        return "https://" + u[len("http://"):]
    return u or ""


def parse_items(raw, count):
    d = json.loads(raw)
    if d.get("code") != 0 or "data" not in d or "list" not in d["data"]:
        raise RuntimeError(f"接口返回异常: {d.get('message') or d}")
    items = d["data"]["list"][:count]
    out = []
    for it in items:
        owner = it.get("owner") or {}
        bvid = it.get("bvid") or ""
        title = clean_text(it.get("title") or "")
        url = f"https://www.bilibili.com/video/{bvid}" if bvid else ""
        out.append({
            "title": title,
            "url": url,
            "author": clean_text(owner.get("name") or ""),
            "cover": to_https(it.get("pic") or ""),
            "duration": fmt_duration(it.get("duration")),
            "tags": clean_text(it.get("tname") or ""),   # 分区名作为可筛选标签
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inspect", action="store_true", help="只打印前 2 条，不入库")
    ap.add_argument("--count", type=int, default=20)
    ap.add_argument("--base", default="http://localhost:9000")
    args = ap.parse_args()

    raw = http_get(RANK_URL)
    items = parse_items(raw, max(args.count, 2 if args.inspect else args.count))

    if args.inspect:
        for i, it in enumerate(items[:2]):
            print(f"--- item {i} ---")
            print(json.dumps(it, ensure_ascii=False, indent=2))
        print(f"\n共解析到 {len(parse_items(raw, args.count))} 条候选")
        return

    ok, skip, fail = 0, 0, 0
    for idx, it in enumerate(items, 1):
        if not it["url"]:
            print(f"[{idx}] 跳过：缺少 bvid/url")
            fail += 1
            continue
        payload = {
            "title": it["title"],
            "url": it["url"],
            "author": it["author"],
            "cover": it["cover"],
            "duration": it["duration"],
            "tags": it["tags"],
            "is_video": True,
            "detail": "",
        }
        try:
            resp = http_post(f"{args.base}/api/bookmarks", payload)
            msg = resp.get("message", "")
            if "已存在" in msg:
                skip += 1
            else:
                ok += 1
            print(f"[{idx}] {msg} | {it['title'][:30]} ({it['author']}, {it['duration']})")
        except Exception as e:  # noqa
            fail += 1
            print(f"[{idx}] 失败: {e} | {it['title'][:30]}")

    print(f"\n完成：新增 {ok} 条，已存在跳过 {skip} 条，失败 {fail} 条。")


if __name__ == "__main__":
    main()
