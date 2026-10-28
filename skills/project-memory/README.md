# project-memory · 项目记忆库

让 AI 在长期项目里“不失忆”：每次开工先读 `MEMORY.md`，每做完重要的事就写回去。换对话、换设备、换 AI 都能无缝接手。

「未名」自己就靠它干活：B站运营、网站、skill 制作跨了很多个对话和两台机器，全靠一份记忆库衔接。

## 安装

把 `project-memory` 文件夹放进你所用工具的 skills 目录，例如 Claude Code：`~/.claude/skills/project-memory/`。

然后在项目里对 AI 说：“给这个项目建一个记忆库”，或者新对话开头说“先读记忆库再开工”。

## 自带工具（Python 3，无依赖）

```bash
python3 scripts/memory.py init                       # 新建 MEMORY.md
python3 scripts/memory.py check MEMORY.md            # 检查缺节、疑似密钥、过长、太久没更新
python3 scripts/memory.py decide MEMORY.md "决策" "原因"   # 记一条带日期的决策
```

## 原则

- 只写位置，不写密码和 key。分享前先跑 `check`。
- 用户最新的话优先，旧决策标删除线，不悄悄覆盖。
- 交接测试：一个全新对话只读这份文件，5 分钟内能接着干。

## 许可

MIT
