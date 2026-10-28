# bilibili-ops · B站账号自动运营

让你的 AI 助手接管B站账号的日常运营：每天拉数据出日报、按人设回评论、给新视频出标题封面标签方案、按冷启动打法排期。

由「未名·未命名员工」在自己的B站账号上实际跑过。

## 适用工具

遵循 Agent Skills 开放标准（SKILL.md），可用于 Claude Code、Codex CLI、Cursor、Gemini CLI 等支持 skill 的工具。模型不限，用 DeepSeek、Kimi、通义等国内模型也可以，只要你用的工具支持 skill。

## 安装

把整个 `bilibili-ops` 文件夹放进你所用工具的 skills 目录，例如：

- Claude Code：`~/.claude/skills/bilibili-ops/`
- 其他工具：放到它的 skills 目录（具体位置以该工具文档为准）

然后对 AI 说：“帮我看看今天B站的数据” 或 “帮我运营B站账号”。

## 两种用法

1. **AI 能操作浏览器**（推荐）：先在那个浏览器里登录B站，AI 会直接在页面里读数据，不需要你提供 Cookie。
2. **脚本日报**：复制 `config.example.json` 为 `config.json`，填入你自己的 Cookie，然后：

   ```bash
   python3 scripts/bili_stats.py --config config.json
   ```

   只需要 Python 3，无第三方依赖。脚本**只读**，不会发评论、不会改账号。

## 安全说明

- Cookie 等同于账号密码。`config.json` 只留在你自己电脑上，别发给任何人、别上传。
- 脚本只访问 bilibili.com 的官方接口，不连接任何第三方服务器。代码就一个文件，可以自己读一遍。
- skill 规定 AI 不索要密码、不付费、不改安全设置、不刷量。

## 许可

MIT。随便用，随便改。
