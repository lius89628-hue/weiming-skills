#!/usr/bin/env python3
"""B站账号日报：拉取账号与稿件数据，和上一次快照对比，输出 Markdown 日报。

用法：
    python3 bili_stats.py --config config.json [--data-dir data] [--json]

config.json（只放在你自己电脑上，不要提交到任何仓库）：
    {"SESSDATA": "...", "bili_jct": "...", "DedeUserID": "..."}

只用 Python 标准库，无需安装依赖。只做读取，不会发评论或修改账号。
"""
import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def load_config(path):
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
    missing = [k for k in ("SESSDATA", "DedeUserID") if not cfg.get(k)]
    if missing:
        sys.exit(f"config.json 缺少字段：{', '.join(missing)}")
    return cfg


def make_get(cfg):
    cookie = "; ".join(f"{k}={cfg[k]}" for k in ("SESSDATA", "bili_jct", "DedeUserID") if cfg.get(k))

    def get(url):
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Referer": "https://member.bilibili.com/",
            "Cookie": cookie,
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode("utf-8"))
        time.sleep(0.5)  # 礼貌间隔，避免触发风控
        return data
    return get


def collect(get):
    nav = get("https://api.bilibili.com/x/web-interface/nav").get("data") or {}
    if not nav.get("isLogin"):
        sys.exit("未登录：Cookie 失效，请重新登录B站后更新 config.json")
    mid = nav["mid"]
    rel = get(f"https://api.bilibili.com/x/relation/stat?vmid={mid}").get("data") or {}
    arcs = get("https://member.bilibili.com/x/web/archives"
               "?status=is_pubing,pubed,not_pubed&pn=1&ps=20").get("data") or {}
    videos = []
    for item in arcs.get("arc_audits") or []:
        a = item.get("Archive") or {}
        bvid = a.get("bvid")
        stat = {}
        if bvid:
            stat = (get(f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}").get("data") or {}).get("stat") or {}
        videos.append({
            "bvid": bvid,
            "title": a.get("title"),
            "state": a.get("state_desc"),
            "ptime": a.get("ptime"),
            "view": stat.get("view", 0), "like": stat.get("like", 0),
            "coin": stat.get("coin", 0), "favorite": stat.get("favorite", 0),
            "reply": stat.get("reply", 0), "share": stat.get("share", 0),
            "danmaku": stat.get("danmaku", 0),
        })
    return {
        "date": dt.date.today().isoformat(),
        "uname": nav.get("uname"),
        "level": (nav.get("level_info") or {}).get("current_level"),
        "coins": nav.get("money"),
        "follower": rel.get("follower", 0),
        "videos": videos,
    }


def load_previous(data_dir, today):
    if not os.path.isdir(data_dir):
        return None
    files = sorted(f for f in os.listdir(data_dir) if f.endswith(".json") and f[:-5] < today)
    if not files:
        return None
    with open(os.path.join(data_dir, files[-1]), encoding="utf-8") as f:
        return json.load(f)


def delta(now, before):
    d = now - before
    return f"+{d}" if d >= 0 else str(d)


def render(snap, prev):
    pv = {v["bvid"]: v for v in (prev or {}).get("videos", [])}
    tot = lambda vs, k: sum(v.get(k, 0) for v in vs)
    prev_videos = (prev or {}).get("videos", [])
    lines = [f"📊 B站日报 {snap['date']}"]
    fol_d = f"（{delta(snap['follower'], prev['follower'])}）" if prev else ""
    lines.append(f"{snap['uname']}｜粉丝 {snap['follower']}{fol_d}｜Lv{snap['level']}｜硬币 {snap['coins']}")
    if prev:
        lines.append("较上次：" + "，".join(
            f"{name} {delta(tot(snap['videos'], k), tot(prev_videos, k))}"
            for name, k in (("播放", "view"), ("点赞", "like"), ("评论", "reply"), ("收藏", "favorite"))))
    else:
        lines.append("（首次运行，明天开始显示增量）")
    lines.append("")
    lines.append("| 稿件 | 状态 | 播放 | 赞 | 币 | 藏 | 评 |")
    lines.append("|---|---|---|---|---|---|---|")
    for v in sorted(snap["videos"], key=lambda x: x.get("ptime") or 0, reverse=True):
        p = pv.get(v["bvid"])
        view = f"{v['view']}" + (f" ({delta(v['view'], p['view'])})" if p else "")
        lines.append(f"| {v['title']} | {v['state']} | {view} | {v['like']} | {v['coin']} | {v['favorite']} | {v['reply']} |")
    if snap["videos"]:
        best = max(snap["videos"], key=lambda x: x["view"] - pv.get(x["bvid"], {}).get("view", 0))
        lines.append("")
        lines.append(f"本期增长最快：《{best['title']}》")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="B站账号日报")
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--json", action="store_true", help="输出原始 JSON 而不是 Markdown")
    args = ap.parse_args()

    snap = collect(make_get(load_config(args.config)))
    prev = load_previous(args.data_dir, snap["date"])
    os.makedirs(args.data_dir, exist_ok=True)
    with open(os.path.join(args.data_dir, f"{snap['date']}.json"), "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=2)
    print(json.dumps(snap, ensure_ascii=False, indent=2) if args.json else render(snap, prev))


if __name__ == "__main__":
    main()
