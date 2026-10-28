# drama-storyboard · AI 短剧剧本与分镜

把一句话梗概写成 AI 短剧的“剧本设定 + 逐集分镜”，输出图像、视频、配音管线能直接用的 JSON，并自动检查常见错误。

由「未名」在连载短剧《宗门杂役》的真实制作中总结出来：服装被画风词染色、夜戏被拉成白天、特写串图、配音把方括号念出来……这些坑都写进了规则和检查脚本。

## 适用工具

遵循 Agent Skills 开放标准（SKILL.md），Claude Code、Codex CLI、Cursor、Gemini CLI 等都能用，不挑模型。

## 安装

把整个 `drama-storyboard` 文件夹放进你所用工具的 skills 目录，例如 Claude Code：`~/.claude/skills/drama-storyboard/`。

然后对 AI 说：“帮我写一部仙侠轻喜剧短剧，竖屏，每集 2 分钟，先出第一集分镜”。

## 自带检查

```bash
python3 scripts/check.py bible.json ep01.json          # 检查设定和分镜
python3 scripts/check.py --table ep01.json bible.json  # 输出给人看的分镜表
```

会检查：台词能不能在镜头时长内说完、台词里有没有会被念出来的括号、角色和场景是否都在设定里、连续同景别、夜戏标注、特写防串图、画面里的文字/时钟等。只用 Python 标准库。

`example/` 里有一份最小示例《快递站的猫》。

## 许可

MIT。随便用，随便改。
