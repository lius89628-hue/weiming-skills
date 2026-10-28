#!/usr/bin/env python3
"""项目记忆库小工具。只用 Python 标准库。

    python3 memory.py init  [目录]                       按模板新建 MEMORY.md
    python3 memory.py check [MEMORY.md]                  检查缺节、疑似密钥、长度、更新日期
    python3 memory.py decide [MEMORY.md] "决策" "原因"   在决策日志顶部加一条
"""
import datetime as dt
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "..", "references", "template.md")
SECTIONS = ["## 0.", "## 1.", "## 2.", "## 3.", "## 4.", "## 5.", "## 6."]
SECRET_PATTERNS = [
    (r"github_pat_[A-Za-z0-9_]{20,}", "GitHub token"),
    (r"\bgh[pousr]_[A-Za-z0-9]{30,}", "GitHub token"),
    (r"\bsk-[A-Za-z0-9_-]{20,}", "API key（sk-）"),
    (r"\bAKIA[0-9A-Z]{16}\b", "AWS key"),
    (r"\bcfut_[A-Za-z0-9]{20,}", "Cloudflare token"),
    (r"\bxox[abpr]-[A-Za-z0-9-]{10,}", "Slack token"),
    (r"(?i)\b(password|passwd|密码|secret|api[_-]?key|token|SESSDATA|bili_jct)\s*[:=：]\s*\S{6,}", "疑似密码或密钥赋值"),
    (r"\b[A-Za-z0-9+/]{40,}={0,2}\b", "疑似长密钥串"),
]
TODAY = dt.date.today().isoformat()


def init(target="."):
    path = os.path.join(target, "MEMORY.md")
    if os.path.exists(path):
        sys.exit(f"{path} 已存在，不覆盖。")
    name = os.path.basename(os.path.abspath(target))
    text = open(TEMPLATE, encoding="utf-8").read().replace("{项目名}", name).replace("{日期}", TODAY)
    open(path, "w", encoding="utf-8").write(text)
    print(f"已创建 {path}")


def check(path="MEMORY.md"):
    text = open(path, encoding="utf-8").read()
    lines = text.splitlines()
    errors, warns = [], []
    for s in SECTIONS:
        if not any(l.startswith(s) for l in lines):
            warns.append(f"缺少小节 {s}")
    for i, line in enumerate(lines, 1):
        if "~/" in line and re.search(r"key|token", line, re.I) and not re.search(r"[:=：]\s*\S{20,}", line):
            continue  # 只写了位置，没写值
        for pat, name in SECRET_PATTERNS:
            if re.search(pat, line):
                errors.append(f"第 {i} 行疑似包含{name}：{line.strip()[:60]}")
                break
    if len(lines) > 300:
        warns.append(f"共 {len(lines)} 行，超过 300 行，建议把旧决策和已完成进度归档")
    m = re.search(r"最后更新[:：]\s*(\d{4}-\d{2}-\d{2})", text)
    if not m:
        warns.append("文件头没有“最后更新：YYYY-MM-DD”")
    else:
        age = (dt.date.today() - dt.date.fromisoformat(m.group(1))).days
        if age > 14:
            warns.append(f"已经 {age} 天没更新，确认内容是否还准确")
    for e in errors:
        print("ERROR", e)
    for w in warns:
        print("WARN ", w)
    print(f"结果：{len(errors)} 个错误，{len(warns)} 个提醒" + ("。" if not errors else "。公开或分享前请先删掉密钥。"))
    return 1 if errors else 0


def decide(path, what, why):
    text = open(path, encoding="utf-8").read()
    entry = f"- {TODAY} · {what} · 原因：{why}"
    m = re.search(r"^## 3\..*$", text, re.M)
    if not m:
        sys.exit("找不到“## 3. 决策日志”小节")
    pos = m.end()
    text = text[:pos] + "\n" + entry + text[pos:]
    text = re.sub(r"最后更新[:：]\s*\d{4}-\d{2}-\d{2}", f"最后更新：{TODAY}", text)
    open(path, "w", encoding="utf-8").write(text)
    print("已记录：", entry)


def main(a):
    if not a or a[0] not in ("init", "check", "decide"):
        print(__doc__)
        return 2
    if a[0] == "init":
        init(a[1] if len(a) > 1 else ".")
        return 0
    if a[0] == "check":
        return check(a[1] if len(a) > 1 else "MEMORY.md")
    if len(a) == 3:
        decide("MEMORY.md", a[1], a[2])
    elif len(a) == 4:
        decide(a[1], a[2], a[3])
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
