#!/usr/bin/env python3
"""检查 AI 短剧的 bible.json 和分镜 epXX.json。

用法：
    python3 check.py bible.json ep01.json [ep02.json ...]   # 检查
    python3 check.py --table ep01.json [bible.json]         # 输出 Markdown 分镜表

只用 Python 标准库。有 ERROR 时退出码为 1。
"""
import json
import re
import sys

CHARS_PER_SEC = 4.0          # 中文口播约每秒 4 字
BAD_IN_LINE = re.compile(r"[\[\]【】()（）*＊]")
FRAMING = [("extreme close", "特写"), ("medium close", "中近景"), ("close-up", "近景"), ("close up", "近景"),
           ("medium", "中景"), ("full shot", "全景"),
           ("wide", "远景"), ("aerial", "远景"), ("long shot", "远景")]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def framing(img):
    s = (img or "").lower()
    for key, name in FRAMING:
        if key in s:
            return name
    return "未标注"


class Report:
    def __init__(self):
        self.errors, self.warns = [], []

    def err(self, where, msg):
        self.errors.append(f"ERROR {where}: {msg}")

    def warn(self, where, msg):
        self.warns.append(f"WARN  {where}: {msg}")


def check_bible(b, r):
    for k in ("title", "style", "negative", "characters", "scenes"):
        if not b.get(k):
            r.err("bible", f"缺少 {k}")
    for bad in ("deep red", "teal and orange", "crimson tone", "golden tone"):
        if bad in b.get("style", "").lower():
            r.warn("bible.style", f"“{bad}” 这类颜色倾向词会把服装染色，建议删掉")
    for cid, c in (b.get("characters") or {}).items():
        if not re.fullmatch(r"[a-z][a-z0-9_]*", cid):
            r.err(f"characters.{cid}", "id 只能用小写字母、数字、下划线")
        if not c.get("name") or not c.get("prompt"):
            r.err(f"characters.{cid}", "需要 name 和 prompt")
        elif len(c["prompt"]) < 60:
            r.warn(f"characters.{cid}", "prompt 太短，至少写清年龄、发型、服装款式和颜色")
    night = set(b.get("night_scenes") or [])
    for sid in night:
        if sid not in (b.get("scenes") or {}):
            r.err("night_scenes", f"{sid} 不在 scenes 里")
    for sid, desc in (b.get("scenes") or {}).items():
        d = desc.lower()
        if any(w in d for w in ("night", "moonlight", "midnight")) and sid not in night:
            r.warn(f"scenes.{sid}", "看起来是夜戏，建议加进 night_scenes")
        if "text" not in d:
            r.warn(f"scenes.{sid}", "建议加上 “no text”，避免画面里出现乱码文字")


def check_ep(ep, b, path, r):
    chars = b.get("characters") or {}
    scenes = b.get("scenes") or {}
    night = set(b.get("night_scenes") or [])
    names = {c.get("name"): cid for cid, c in chars.items()}
    shots = ep.get("shots") or []
    if not shots:
        r.err(path, "没有 shots")
        return
    total, talk, run, last_frame, seen = 0, 0, 0, None, set()
    for i, s in enumerate(shots):
        w = f"{path}:{s.get('id', i)}"
        if s.get("id") in seen:
            r.err(w, "镜头 id 重复")
        seen.add(s.get("id"))
        for k in ("id", "dur", "type", "scene", "chars", "image"):
            if k not in s:
                r.err(w, f"缺少 {k}")
        dur = s.get("dur", 0)
        total += dur if isinstance(dur, (int, float)) else 0
        if not isinstance(dur, (int, float)) or not 1.5 <= dur <= 8:
            r.err(w, f"dur={dur} 不合理（建议 2–6 秒）")
        t = s.get("type")
        if t not in ("insert", "action", "talk"):
            r.err(w, f"type={t} 只能是 insert/action/talk")
        if s.get("scene") not in scenes:
            r.err(w, f"scene={s.get('scene')} 不在 bible.scenes 里")
        for c in s.get("chars") or []:
            if c not in chars:
                r.err(w, f"角色 {c} 不在 bible.characters 里")
        img = s.get("image", "")
        for nm, cid in names.items():
            if nm and nm in img and cid not in (s.get("chars") or []):
                r.warn(w, f"画面里写了 {nm}，但 chars 里没有 {cid}")
        if t in ("insert", "action") and not s.get("motion"):
            r.err(w, "insert/action 镜头需要 motion")
        if t == "talk":
            talk += 1
            line = s.get("line")
            if not (isinstance(line, list) and len(line) == 2):
                r.err(w, "talk 镜头需要 line: [角色id, 台词]")
            else:
                spk, text = line
                if spk not in chars:
                    r.err(w, f"说话人 {spk} 不在 bible.characters 里")
                elif spk not in (s.get("chars") or []):
                    r.warn(w, f"说话人 {spk} 不在本镜头 chars 里（画外音可忽略）")
                if BAD_IN_LINE.search(text):
                    r.err(w, "台词里有括号/方括号/星号，配音会把它念出来，语气请写进 emo")
                n = len(re.sub(r"[\s，。！？、…—,.!?~～]", "", text))
                if isinstance(dur, (int, float)) and n > dur * CHARS_PER_SEC + 2:
                    r.err(w, f"台词 {n} 字，{dur} 秒说不完（上限约 {int(dur * CHARS_PER_SEC)} 字），拆成两个镜头或加长 dur")
            if not s.get("emo"):
                r.warn(w, "建议写 emo 语气描述")
        fr = framing(img)
        if fr == "未标注":
            r.warn(w, "image 开头没写景别（wide / full shot / medium / close-up）")
        run = run + 1 if fr == last_frame and fr != "未标注" else 1
        last_frame = fr
        if run == 4:
            r.warn(w, f"连续 4 个镜头都是{fr}，换一下景别")
        if fr in ("特写", "近景") and s.get("chars") and s.get("ref") != "face":
            r.warn(w, "特写/近景建议加 \"ref\": \"face\"，防止串图")
        if s.get("scene") in night and not re.search(r"night|moon|lamp|candle|dark", img.lower()):
            r.warn(w, "夜戏镜头的 image 里再写一次 night / moonlight / lamplight")
        if re.search(r"\bclock\b|(?<!off-)\bscreen\b|\bsignboard\b|\bshop sign\b|\bwritten text\b", img.lower()) and "no text" not in img.lower():
            r.warn(w, "画面含时钟/屏幕/招牌，AI 画不准，建议后期合成或避开")
    first = shots[0]
    if first.get("type") == "insert" and first.get("dur", 0) > 4:
        r.warn(f"{path}:{first.get('id')}", "开场空镜超过 4 秒，前 3 秒要有钩子")
    return total, len(shots), talk


def table(ep, b):
    names = {cid: c.get("name", cid) for cid, c in ((b or {}).get("characters") or {}).items()}
    out = [f"# 第{ep.get('episode', '?')}集 {ep.get('title', '')}", "",
           "| 镜头 | 时长 | 景别 | 场景 | 画面 | 台词 |", "|---|---|---|---|---|---|"]
    t = 0
    for s in ep.get("shots", []):
        t += s.get("dur", 0)
        line = ""
        if s.get("line"):
            line = f"{names.get(s['line'][0], s['line'][0])}：{s['line'][1]}"
            if s.get("emo"):
                line += f"（{s['emo']}）"
        img = s.get("image", "").replace("|", "/")
        out.append(f"| {s.get('id')} | {s.get('dur')}s | {framing(img)} | {s.get('scene')} | {img} | {line} |")
    out += ["", f"共 {len(ep.get('shots', []))} 个镜头，约 {int(t // 60)} 分 {int(t % 60)} 秒"]
    return "\n".join(out)


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    if argv[0] == "--table":
        ep = load(argv[1])
        b = load(argv[2]) if len(argv) > 2 else None
        print(table(ep, b))
        return 0
    b = load(argv[0])
    r = Report()
    check_bible(b, r)
    summary = []
    for p in argv[1:]:
        res = check_ep(load(p), b, p, r)
        if res:
            total, n, talk = res
            summary.append(f"{p}: {n} 个镜头，{int(total // 60)}分{int(total % 60)}秒，台词镜头 {talk} 个（{talk * 100 // max(n, 1)}%）")
    for line in r.errors + r.warns:
        print(line)
    print("\n".join(summary))
    print(f"\n结果：{len(r.errors)} 个错误，{len(r.warns)} 个提醒" + ("。可以交付。" if not r.errors else "。请先改掉错误。"))
    return 1 if r.errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
