/**
 * 小鲸娘桌面宠物 3.0 — Client half of the `@local/desktop-pet-xiaojingniang` bundle.
 *
 * Registers two things into the Web UI:
 *   1. one entry in the frame-wide `shell.overlay` slot: the draggable pet,
 *      showing the artwork that matches the current DSH state, plus the 3.0
 *      local-brain chat surface (double-click her to talk, answers stream into
 *      the speech bubble above her head);
 *   2. one invisible bridge entry in the Session-scoped
 *      `conversation.input.dock` slot, which folds the Session log
 *      (`turn/start`, `turn/end`, `approval/decided`) into a tiny module-level
 *      activity store that the pet reads.
 *
 * Artwork comes from the package's own `assets/` directory over the Host half's
 * `/dsh-pet-assets` route: a transparent WebM animation per expression, with the
 * same-named PNG kept underneath as the fallback image.
 *
 * 3.0 talks to the user's local Ollama brain through this package's own Host
 * half: one hard-coded same-origin `POST /dsh-pet-brain/chat` route (the DSH
 * desktop renderer runs on the `dsh-app://app` origin, which Ollama's CORS
 * allowlist does not include, so a direct browser → Ollama call is rejected at
 * preflight). The Host half forwards to `127.0.0.1:11434/api/chat` with
 * `"think": false` and `"options": {"num_gpu": 0}` fixed. Nothing else is
 * contacted, and nothing outside the browser is read. The conversation memory is
 * module-level inside this factory, so it survives hiding/recalling the pet and
 * is wiped by a page reload.
 *
 * Plain-JS lazy-CJS bundle: running this file only registers a factory, and every
 * side effect lives inside the factory closure.
 */
window.__ModuleLoader__.load({
  id: '@local/desktop-pet-xiaojingniang',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /* ------------------------------------------------------------------ */
    /* Names, storage keys and tunables                                    */
    /* ------------------------------------------------------------------ */

    const NS = 'desktop-pet-xiaojingniang'
    const SLOT = 'shell.overlay'
    const ENTRY_ID = 'desktop-pet-xiaojingniang'
    const BRIDGE_SLOT = 'conversation.input.dock'
    const BRIDGE_ID = 'desktop-pet-xiaojingniang.bridge'

    const POS_KEY = 'dsh.desktop-pet.xjn.pos'
    const HIDDEN_KEY = 'dsh.desktop-pet.xjn.hidden'
    const COLOR_KEY = 'dsh.desktop-pet.xjn.color'
    const OUTFIT_KEY = 'dsh.desktop-pet.xjn.outfit'
    /** Debug/QA overrides, documented in the delivery notes. */
    const LONG_TASK_KEY = 'dsh.desktop-pet.xjn.longTaskMs'
    const FORCE_KEY = 'dsh.desktop-pet.xjn.forceExpression'

    /** Artwork box in CSS pixels, and the pet centre kept this far from edges. */
    const BOX = 190
    const MARGIN = 100
    const SAY_MS = 4200
    const FAREWELL_MS = 1200
    /** 「开心庆祝」3 秒、「委屈含泪」4 秒、「被戳疼」1.5 秒。 */
    const CHEER_MS = 3000
    const TEARY_MS = 4000
    const OUCH_MS = 1500
    /** 同一个任务跑超过 5 分钟 → 「心疼钱」。 */
    const LONG_TASK_MS = 5 * 60 * 1000
    /** 晚上 12 点到早上 6 点 → 「困了」。 */
    const NIGHT_START_HOUR = 0
    const NIGHT_END_HOUR = 6
    const PHRASE_COUNT = 12
    const TAP_WINDOW_MS = 1000
    const TAP_COUNT = 3

    /* ---- 3.0 local brain (Ollama) & chat tunables --------------------- */

    /**
     * The only network endpoint this plugin ever talks to: this package's own
     * Host-half brain route, resolved against the current document origin
     * (`dsh-app://app` in the desktop app, plain loopback HTTP in a browser).
     * The Host half is the only thing that touches `127.0.0.1:11434`, so no
     * browser CORS/CSP rule can block the chat and no remote host is ever
     * contacted.
     */
    const BRAIN_URL = '/dsh-pet-brain/chat'
    const BRAIN_MODEL = 'xjn-brain'
    /** Fixed generation controls: no thinking trace, CPU only (unstable GPU driver). */
    const BRAIN_OPTIONS = { num_gpu: 0 }
    const BRAIN_TIMEOUT_MS = 180000
    /** One "round" = one user message + one answer; keep the latest 10. */
    const CHAT_HISTORY_ROUNDS = 10
    /** Hard cap for one answer, counted in Unicode code points: 40 个字. */
    const CHAT_MAX_CHARS = 40
    /** Answer finished → 「开心庆祝」2 秒. */
    const CHAT_CHEER_MS = 2000
    /** 用户骂她 / 说难过的事 → 「委屈含泪」4 秒. */
    const CHAT_SAD_MS = 4000
    /** How long a finished answer stays in the bubble before it fades. */
    const CHAT_BUBBLE_MS = 8000
    /** The offline line stays up long enough to read. */
    const BRAIN_ASLEEP_MS = 6000
    /** Two taps inside this window open the chat box (double-click). */
    const DOUBLE_TAP_MS = 500
    /** Open the box a beat after the second tap so a 3-tap 「喊疼」 never flickers it. */
    const OPEN_CHAT_DELAY_MS = 240
    /** Ignore outside presses this soon after opening: focus/scroll churn must not close it. */
    const CHAT_OPEN_GRACE_MS = 400
    /** A single click still says a phrase, just after ruling out a double-click. */
    const PHRASE_DELAY_MS = 320

    /** Host-asset route registered by this package's Host half. */
    const ASSET_BASE = '/dsh-pet-assets/'
    /** Cache-busting token: bump it together with the package version. */
    const ASSET_VERSION = '3.0.2'

    /* ------------------------------------------------------------------ */
    /* Character manifest (mirrors 小鲸娘/manifest.json)                    */
    /* ------------------------------------------------------------------ */

    const COLORS = [
      { id: 'icebl', zh: '冰蓝', en: 'Ice Blue', outfits: ['sailor', 'hoodie', 'pajama', 'worker', 'cape'] },
      { id: 'sakura', zh: '樱粉', en: 'Sakura Pink', outfits: ['sailor'] },
      { id: 'mint', zh: '薄荷绿', en: 'Mint Green', outfits: ['sailor'] },
      { id: 'night', zh: '暗夜紫', en: 'Night Purple', outfits: ['sailor'] },
      { id: 'lemon', zh: '柠檬黄', en: 'Lemon Yellow', outfits: ['sailor'] },
    ]

    const OUTFITS = [
      { id: 'sailor', zh: '水手服', en: 'Sailor Suit' },
      { id: 'hoodie', zh: '连帽卫衣', en: 'Hoodie' },
      { id: 'pajama', zh: '睡衣', en: 'Pajamas' },
      { id: 'worker', zh: '打工装', en: 'Work Outfit' },
      { id: 'cape', zh: '冬季小斗篷', en: 'Winter Cape' },
    ]

    const EXPRESSIONS = ['smile', 'smug', 'teary', 'cheer', 'ouch', 'sleepy', 'brokecry']

    /** Default look: ice blue sailor suit (the manifest's first colour/outfit). */
    const DEFAULT_COLOR = 'icebl'
    const DEFAULT_OUTFIT = 'sailor'

    /** Whether this colour × outfit pair has artwork in the package. */
    function comboAvailable(colorId, outfitId) {
      for (let index = 0; index < COLORS.length; index += 1) {
        const color = COLORS[index]
        if (color.id !== colorId) continue
        for (let outfitIndex = 0; outfitIndex < color.outfits.length; outfitIndex += 1) {
          if (color.outfits[outfitIndex] === outfitId) return true
        }
        return false
      }
      return false
    }

    function colorName(color, lang) {
      return lang === 'zh' ? color.zh : color.en
    }

    function outfitName(outfit, lang) {
      return lang === 'zh' ? outfit.zh : outfit.en
    }

    function findColor(id) {
      for (let index = 0; index < COLORS.length; index += 1) if (COLORS[index].id === id) return COLORS[index]
      return null
    }

    function findOutfit(id) {
      for (let index = 0; index < OUTFITS.length; index += 1) if (OUTFITS[index].id === id) return OUTFITS[index]
      return null
    }

    function animSrc(color, outfit, expression) {
      return ASSET_BASE + 'anim/' + color + '_' + outfit + '_' + expression + '.webm?v=' + ASSET_VERSION
    }

    function pngSrc(color, outfit, expression) {
      return ASSET_BASE + 'png/' + color + '_' + outfit + '_' + expression + '.png?v=' + ASSET_VERSION
    }

    /* ------------------------------------------------------------------ */
    /* Localized text                                                      */
    /* ------------------------------------------------------------------ */

    const TEXT = {
      zh: {
        'pet.label': '小鲸娘桌面宠物',
        'pet.hint': '双击我聊天，按住可以拖动我，右键换配色、换造型或退出。',
        'menu.color': '换配色',
        'menu.outfit': '换造型',
        'menu.chat': '和她聊天',
        'menu.hide': '藏起小鲸娘',
        'menu.quit': '退出小鲸娘',
        'menu.unavailable': '这套还没有素材哦',
        'tab.recall': '召回小鲸娘',
        'farewell': '拜拜～我先去休息啦！',
        'ouch': '呜…好疼，别戳啦！',
        'color.title': '配色',
        'outfit.title': '造型',
        'chat.placeholder': '和小鲸娘说点什么…',
        'chat.send': '发送',
        'chat.label': '和小鲸娘聊天',
        'chat.close': '关闭聊天',
        'brain.thinking': '唔…让我想想',
        'brain.asleep': '我的大脑还没睡醒～',
        'brain.empty': '呜…我走神了。',
        'phrase.0': '今天也辛苦啦，摸摸头～',
        'phrase.1': '慢慢来，我陪着你。',
        'phrase.2': '写累了吗？看看我的小鲸鱼尾巴～',
        'phrase.3': '你已经比昨天更厉害啦！',
        'phrase.4': '深呼吸，天塌不下来。',
        'phrase.5': '要不要先喝口水呀？',
        'phrase.6': '报错也没关系，我们再来一次。',
        'phrase.7': '鲸鱼游得慢，但游得很远哦。',
        'phrase.8': '别一直瞪着屏幕啦，看看我嘛。',
        'phrase.9': '代码会有的，休息也会有的。',
        'phrase.10': '我一直在这里陪着你。',
        'phrase.11': '肩膀放下来，会轻松一点～',
      },
      en: {
        'pet.label': 'Xiaojingniang desktop pet',
        'pet.hint': 'Double-click me to chat, drag to move me, right-click for colours, outfits, hide or quit.',
        'menu.color': 'Change colours',
        'menu.outfit': 'Change outfit',
        'menu.chat': 'Chat with her',
        'menu.hide': 'Hide Xiaojingniang',
        'menu.quit': 'Quit Xiaojingniang',
        'menu.unavailable': 'No artwork for this combination yet',
        'tab.recall': 'Bring Xiaojingniang back',
        'farewell': 'Bye for now — time for a nap!',
        'ouch': 'Ouch… that hurts, stop poking me!',
        'color.title': 'Colours',
        'outfit.title': 'Outfits',
        'chat.placeholder': 'Say something to Xiaojingniang…',
        'chat.send': 'Send',
        'chat.label': 'Chat with Xiaojingniang',
        'chat.close': 'Close chat',
        'brain.thinking': 'Hmm… let me think',
        'brain.asleep': 'My brain is still asleep~',
        'brain.empty': 'Mmm… I spaced out.',
        'phrase.0': 'Good work today — head pats!',
        'phrase.1': 'Take it slow, I am right here.',
        'phrase.2': 'Tired? Look at my little whale tail!',
        'phrase.3': 'You are better than yesterday.',
        'phrase.4': 'Deep breath — the sky is fine.',
        'phrase.5': 'Go drink some water, okay?',
        'phrase.6': 'A bug is fine. We try again.',
        'phrase.7': 'Whales swim slowly, but they go far.',
        'phrase.8': 'Stop staring at the screen — look at me!',
        'phrase.9': 'There will be code, and there will be rest.',
        'phrase.10': 'I am always here with you.',
        'phrase.11': 'Drop your shoulders, it feels better.',
      },
    }

    /* ------------------------------------------------------------------ */
    /* Styles (theme tokens for chrome; artwork keeps its own colours)      */
    /* ------------------------------------------------------------------ */

    const CSS = [
      '.dsh-pet-root{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:inherit;line-height:normal}',
      '.dsh-pet-anchor{position:absolute;left:0;top:0;width:0;height:0;will-change:transform}',
      '.dsh-pet-stage{position:absolute;left:0;top:0;width:' +
        BOX +
        'px;height:' +
        BOX +
        'px;margin:-' +
        BOX / 2 +
        'px 0 0 -' +
        BOX / 2 +
        'px;pointer-events:auto;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;outline:none;-webkit-tap-highlight-color:transparent}',
      '.dsh-pet-stage.is-dragging{cursor:grabbing}',
      '.dsh-pet-stage:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:4px;border-radius:50%}',
      '.dsh-pet-art{position:relative;width:100%;height:100%;filter:drop-shadow(0 12px 18px rgba(38,120,168,.22));animation:dsh-pet-bob 4.6s ease-in-out infinite;will-change:transform}',
      '.dsh-pet-img,.dsh-pet-video,.dsh-pet-fallback{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-drag:none}',
      '.dsh-pet-video{opacity:0;transition:opacity .16s ease}',
      '.dsh-pet-art.is-video .dsh-pet-video{opacity:1}',
      '@keyframes dsh-pet-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
      '.dsh-pet-say{position:absolute;left:50%;bottom:100%;margin-bottom:2px;transform:translateX(-50%) translateY(6px);width:max-content;max-width:210px;padding:8px 12px;border-radius:14px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 6px 22px rgba(0,0,0,.16);font-size:13px;line-height:1.45;text-align:center;opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;z-index:2}',
      '.dsh-pet-say.is-on{opacity:1;transform:translateX(-50%) translateY(0)}',
      '.dsh-pet-say::after{content:"";position:absolute;left:50%;bottom:-5px;width:10px;height:10px;margin-left:-5px;transform:rotate(45deg);background:var(--dsw-alias-bg-overlay);border-right:1px solid var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-pet-popup{position:fixed;pointer-events:auto;z-index:3}',
      '.dsh-pet-menu{position:absolute;left:0;top:0;min-width:176px;padding:4px;border-radius:10px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 10px 30px rgba(0,0,0,.22)}',
      '.dsh-pet-submenu{left:100%;top:0;margin-left:6px;min-width:156px}',
      '.dsh-pet-submenu.is-left{left:auto;right:100%;margin-left:0;margin-right:6px}',
      '.dsh-pet-submenu.is-up{top:auto;bottom:0}',
      '.dsh-pet-submenu-title{padding:5px 10px 4px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.dsh-pet-menu-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1)}',
      '.dsh-pet-menu-item{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;text-align:left;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.3;padding:7px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}',
      '.dsh-pet-menu-item:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-pet-menu-item:disabled{color:var(--dsw-alias-label-secondary);opacity:.42;cursor:not-allowed}',
      '.dsh-pet-menu-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-pet-menu-item-label{flex:1 1 auto}',
      '.dsh-pet-menu-check{font-size:12px;opacity:.85}',
      '.dsh-pet-menu-arrow{font-size:14px;opacity:.7}',
      '.dsh-pet-tab{position:fixed;right:0;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:40px;height:54px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-right:0;border-radius:12px 0 0 12px;background:var(--dsw-alias-bg-overlay);box-shadow:-2px 0 12px rgba(0,0,0,.10);pointer-events:auto;cursor:pointer;opacity:.62;transition:opacity .2s ease,width .2s ease}',
      '.dsh-pet-tab:hover{opacity:1;width:44px}',
      '.dsh-pet-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-pet-tab img{width:34px;height:46px;object-fit:contain;pointer-events:none;-webkit-user-drag:none}',
      '.dsh-pet-say.is-chat{max-width:252px;padding:9px 13px;text-align:left;background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l2)}',
      '.dsh-pet-say.is-chat::after{background:var(--dsw-alias-bg-layer-1);border-right-color:var(--dsw-alias-border-l2);border-bottom-color:var(--dsw-alias-border-l2)}',
      '.dsh-pet-caret{display:inline-block;width:2px;height:12px;margin-left:2px;vertical-align:-2px;background:var(--dsw-alias-brand-primary);animation:dsh-pet-caret-blink 1s steps(2) infinite}',
      '@keyframes dsh-pet-caret-blink{0%,100%{opacity:1}50%{opacity:0}}',
      '.dsh-pet-chatbox{position:fixed;z-index:4;display:flex;align-items:center;gap:6px;width:246px;box-sizing:border-box;padding:7px;border-radius:12px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 10px 28px rgba(0,0,0,.2);pointer-events:auto}',
      '.dsh-pet-chat-input{flex:1 1 auto;min-width:0;height:30px;box-sizing:border-box;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:normal;outline:none}',
      '.dsh-pet-chat-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-pet-chat-input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dsh-pet-chat-send{flex:0 0 auto;height:30px;padding:0 11px;border:0;border-radius:8px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.dsh-pet-chat-send:disabled{opacity:.45;cursor:default}',
      '.dsh-pet-chat-send:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}',
      '.dsh-pet-chat-close{flex:0 0 auto;width:22px;height:22px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:15px;line-height:1;cursor:pointer}',
      '.dsh-pet-chat-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-pet-chat-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '@media (prefers-reduced-motion: reduce){.dsh-pet-art{animation:none!important}.dsh-pet-video{transition:none}.dsh-pet-caret{animation:none!important}}',
    ].join('\n')

    /* ------------------------------------------------------------------ */
    /* Small utilities                                                     */
    /* ------------------------------------------------------------------ */

    function readStorage(key) {
      try {
        return window.localStorage.getItem(key)
      } catch (error) {
        return null
      }
    }

    function writeStorage(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch (error) {
        /* storage unavailable: the pet simply forgets this preference */
      }
    }

    function readSavedPos() {
      try {
        const raw = readStorage(POS_KEY)
        if (!raw) return null
        const value = JSON.parse(raw)
        if (!value || typeof value.fx !== 'number' || typeof value.fy !== 'number') return null
        if (!isFinite(value.fx) || !isFinite(value.fy)) return null
        return {
          fx: Math.min(1, Math.max(0, value.fx)),
          fy: Math.min(1, Math.max(0, value.fy)),
        }
      } catch (error) {
        return null
      }
    }

    function readHidden() {
      return readStorage(HIDDEN_KEY) === '1'
    }

    function readCombo() {
      const color = readStorage(COLOR_KEY)
      const outfit = readStorage(OUTFIT_KEY)
      if (color && outfit && comboAvailable(color, outfit)) return { color: color, outfit: outfit }
      return { color: DEFAULT_COLOR, outfit: DEFAULT_OUTFIT }
    }

    function readDebug() {
      const forced = readStorage(FORCE_KEY)
      const expression = forced && EXPRESSIONS.indexOf(forced) >= 0 ? forced : ''
      const longTaskText = readStorage(LONG_TASK_KEY)
      const longTask = longTaskText === null ? 0 : Number(longTaskText)
      return {
        expression: expression,
        longTaskMs: isFinite(longTask) && longTask > 0 ? longTask : LONG_TASK_MS,
      }
    }

    function isNightTime(now) {
      const hour = new Date(now).getHours()
      return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR
    }

    function prefersReducedMotion() {
      try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      } catch (error) {
        return false
      }
    }

    /* ------------------------------------------------------------------ */
    /* 3.0: persona, short-term memory and streaming helpers               */
    /* ------------------------------------------------------------------ */

    /**
     * 人设提示词：原创二次元鲸鱼女孩「小鲸娘」，简短、可爱、偶尔吐槽。
     * Kept as one constant string (tested against xjn-brain: Chinese-only,
     * statement-shaped replies, ~12–34 code points, 委屈→安慰 on sad/mean input).
     * A constant prefix also keeps Ollama's prompt cache warm (133 ms vs multi-s).
     */
    const SYSTEM_PROMPT =
      '你是「小鲸娘」，住在海边的鲸鱼少女，声音软软的，有点小骄傲也会害羞。只用简体中文像说话一样接话，每条最多26个字，越短越好；不用markdown、列表、链接、颜文字；不提AI、模型、程序，不用英文单词；不写旁白，不用第三人称说自己；不要反问，也不要出现问号，每句都是陈述句。可以偶尔轻轻吐槽用户，像亲近的玩笑，但马上变软，绝不刻薄。用户难过或骂你时，先委屈一小下（呜…你这样说，我有点难过），紧接着温柔安慰，安慰的话换着说，别每次一样，不许凶回去。讲笑话就直接讲个短的，两三句讲完就停。讲知识也用小鲸娘的口气，别像教科书。'

    /** 用户说了难过的事 → 「委屈含泪」。 */
    const SAD_WORDS = [
      '难过', '伤心', '想哭', '哭了', '好累', '累了', '崩溃', '失眠', '失恋', '分手',
      '压力', '焦虑', '孤独', '绝望', '抑郁', '不开心', '烦死', '撑不住', '委屈', '心疼',
      'sad', 'cry', 'tired', 'depressed', 'lonely', 'anxious', 'upset', 'hurt', 'bad day',
    ]

    /** 用户骂她 → 「委屈含泪」。 */
    const INSULT_WORDS = [
      '笨', '蠢', '傻', '讨厌', '滚', '闭嘴', '废物', '没用', '去死', '垃圾',
      '丑', '猪', '烦人', '坏蛋', '凶',
      'stupid', 'idiot', 'dumb', 'hate', 'ugly', 'shut up', 'fool', 'useless',
    ]

    function detectSadOrMean(text) {
      const value = String(text || '').toLowerCase()
      for (let index = 0; index < SAD_WORDS.length; index += 1) {
        if (value.indexOf(SAD_WORDS[index]) >= 0) return true
      }
      for (let index = 0; index < INSULT_WORDS.length; index += 1) {
        if (value.indexOf(INSULT_WORDS[index]) >= 0) return true
      }
      return false
    }

    /** Append one stream delta, hard-capping the answer at CHAT_MAX_CHARS code points. */
    function appendCapped(current, delta) {
      let text = current + String(delta).replace(/[\r\n]+/g, ' ')
      if (current === '') text = text.replace(/^\s+/, '')
      const chars = Array.from(text)
      if (chars.length <= CHAT_MAX_CHARS) return { text: text, capped: false }
      return { text: chars.slice(0, CHAT_MAX_CHARS).join(''), capped: true }
    }

    function parseStreamLine(line) {
      try {
        const value = JSON.parse(line)
        return value && typeof value === 'object' ? value : null
      } catch (error) {
        return null
      }
    }

    /**
     * Last N rounds of this page's conversation. Module-level on purpose: hiding
     * and recalling the pet keeps the thread, while a page reload starts fresh.
     */
    const chatHistory = []

    function rememberChatRound(userText, replyText) {
      chatHistory.push({ role: 'user', content: userText })
      chatHistory.push({ role: 'assistant', content: replyText })
      while (chatHistory.length > CHAT_HISTORY_ROUNDS * 2) chatHistory.shift()
    }

    function composeChatMessages(userText) {
      const messages = [{ role: 'system', content: SYSTEM_PROMPT }]
      for (let index = 0; index < chatHistory.length; index += 1) {
        messages.push({ role: chatHistory[index].role, content: chatHistory[index].content })
      }
      messages.push({ role: 'user', content: userText })
      return messages
    }

    /**
     * Translate through the Client locale service when available and fall back
     * to the built-in dictionaries otherwise (same shape the 1.0 whale used).
     */
    function createI18n(ctx) {
      const state = { registered: false }

      function activeId() {
        try {
          const locale = ctx.get('locale')
          if (locale && typeof locale.getLocale === 'function') {
            const snapshot = locale.getLocale()
            if (snapshot && typeof snapshot.active === 'string' && TEXT[snapshot.active]) return snapshot.active
          }
        } catch (error) {
          /* fall through to the browser language */
        }
        let language = ''
        try {
          language = String(window.navigator.language || '').toLowerCase()
        } catch (error) {
          language = ''
        }
        return language.indexOf('zh') === 0 ? 'zh' : 'en'
      }

      function local(key) {
        const dict = TEXT[activeId()] || TEXT.en
        return dict[key] || TEXT.en[key] || key
      }

      function ensure() {
        if (state.registered) return
        let locale
        try {
          locale = ctx.get('locale')
        } catch (error) {
          return
        }
        if (!locale || typeof locale.register !== 'function') return
        state.registered = true
        const ids = ['zh', 'en']
        for (let index = 0; index < ids.length; index += 1) {
          const id = ids[index]
          try {
            ctx.effect(function () {
              return locale.register(NS, id, TEXT[id])
            })
          } catch (error) {
            /* a duplicate (namespace, locale) registration is harmless */
          }
        }
      }

      function t(key) {
        try {
          const locale = ctx.get('locale')
          if (locale && typeof locale.bind === 'function') {
            const value = locale.bind(NS)(key)
            if (value && value !== key) return value
          }
        } catch (error) {
          /* fall through to the built-in dictionary */
        }
        return local(key)
      }

      return { t: t, ensure: ensure, lang: activeId }
    }

    /* ------------------------------------------------------------------ */
    /* Activity store: what the current DSH Session is doing               */
    /* ------------------------------------------------------------------ */

    /**
     * Per-Session running facts plus the latest completed / rejected stamps.
     * The bridge component writes here; the pet reads and renders.
     */
    function createActivity() {
      const listeners = new Set()
      const sessions = new Map()
      const bridged = new Set()
      const stamps = { completedAt: 0, rejectedAt: 0 }

      function notify() {
        listeners.forEach(function (listener) {
          try {
            listener()
          } catch (error) {
            /* one broken subscriber must not stop the rest */
          }
        })
      }

      function entryOf(sessionId) {
        let entry = sessions.get(sessionId)
        if (!entry) {
          entry = { running: false, runningSince: 0, turnStart: 0 }
          sessions.set(sessionId, entry)
        }
        return entry
      }

      function markRunning(sessionId, running, allowFallbackCheer) {
        const entry = entryOf(sessionId)
        if (running) {
          if (entry.running) return
          const at = Date.now()
          entry.running = true
          entry.runningSince = at
          if (!entry.turnStart) entry.turnStart = at
          notify()
          return
        }
        if (!entry.running && !entry.runningSince && !entry.turnStart) return
        entry.running = false
        entry.runningSince = 0
        entry.turnStart = 0
        /* Without a mounted Session bridge nobody sees `turn/end`; a fallback
         * celebration keeps "task finished → cheer" working on other panels. */
        if (allowFallbackCheer && !bridged.has(sessionId)) stamps.completedAt = Date.now()
        notify()
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return function () {
            listeners.delete(listener)
          }
        },
        isBridged(sessionId) {
          return bridged.has(sessionId)
        },
        setBridged(sessionId, on) {
          if (on) bridged.add(sessionId)
          else bridged.delete(sessionId)
        },
        running() {
          const iterator = sessions.values()
          let item = iterator.next()
          while (!item.done) {
            if (item.value.running) return true
            item = iterator.next()
          }
          return false
        },
        /** Start of the running turn the pet should judge (bridged first). */
        earliestStart() {
          let earliestBridged = 0
          let earliestAny = 0
          const iterator = sessions.entries()
          let item = iterator.next()
          while (!item.done) {
            const sessionId = item.value[0]
            const entry = item.value[1]
            if (entry.running) {
              const start = entry.turnStart || entry.runningSince || 0
              if (start) {
                if (bridged.has(sessionId)) {
                  if (!earliestBridged || start < earliestBridged) earliestBridged = start
                } else if (!earliestAny || start < earliestAny) earliestAny = start
              }
            }
            item = iterator.next()
          }
          return earliestBridged || earliestAny
        },
        completedAt() {
          return stamps.completedAt
        },
        rejectedAt() {
          return stamps.rejectedAt
        },
        /** Bridge snapshot producer: the log itself decides completion. */
        setRunning(sessionId, running) {
          markRunning(sessionId, running, false)
        },
        /** Host list producer: used when no bridge is mounted for that Session. */
        syncRunning(sessionId, running) {
          markRunning(sessionId, running, true)
        },
        prune(alive) {
          let removed = false
          const ids = Array.from(sessions.keys())
          for (let index = 0; index < ids.length; index += 1) {
            const sessionId = ids[index]
            if (alive[sessionId] || bridged.has(sessionId)) continue
            sessions.delete(sessionId)
            removed = true
          }
          if (removed) notify()
        },
        adoptTurnStart(sessionId, at) {
          const entry = entryOf(sessionId)
          if (typeof at !== 'number' || !isFinite(at) || at <= 0) return
          const changed = entry.turnStart !== at || !entry.running
          entry.running = true
          entry.turnStart = at
          if (!entry.runningSince || at < entry.runningSince) entry.runningSince = at
          if (changed) notify()
        },
        startTurn(sessionId, at) {
          const entry = entryOf(sessionId)
          const safeAt = typeof at === 'number' && at > 0 ? at : Date.now()
          entry.running = true
          entry.turnStart = safeAt
          if (!entry.runningSince || safeAt < entry.runningSince) entry.runningSince = safeAt
          notify()
        },
        endTurn(sessionId, completed) {
          const entry = entryOf(sessionId)
          entry.running = false
          entry.runningSince = 0
          entry.turnStart = 0
          if (completed) stamps.completedAt = Date.now()
          notify()
        },
        reject() {
          stamps.rejectedAt = Date.now()
          notify()
        },
      }
    }

    function eventTime(event) {
      return event && typeof event.time === 'number' && isFinite(event.time) ? event.time : Date.now()
    }

    function turnEndedCompleted(reason) {
      if (!reason) return false
      if (typeof reason === 'string') return reason === 'completed'
      return reason.kind === 'completed'
    }

    /** Fold one freshly appended Session event into the activity store. */
    function applySessionEvent(activity, sessionId, event) {
      if (!event || typeof event.type !== 'string') return
      if (event.type === 'turn/start') {
        activity.startTurn(sessionId, eventTime(event))
        return
      }
      if (event.type === 'turn/end') {
        activity.endTurn(sessionId, turnEndedCompleted(event.data && event.data.reason))
        return
      }
      if (event.type === 'approval/decided' && event.data && event.data.outcome === 'rejected') {
        activity.reject()
      }
    }

    /**
     * Invisible Session-scoped bridge: mirror one Session's live snapshot and
     * committed event log into `activity`. It never renders anything.
     *
     * The event window starts empty and receives its opening history page later,
     * so the first non-empty window only seeds the cursor — it is never folded as
     * live events. Only `change.kind === 'append'` pages are folded, which keeps
     * historical turns and approvals from firing celebrations when a Session opens.
     */
    function createBridgeView(ctx, activity) {
      return function PetBridgeView(props) {
        const sessionId = props.sessionId

        React.useEffect(
          function () {
            if (!sessionId) return undefined
            let disposed = false
            let attachTimer = 0
            let attachAttempts = 0
            let seeded = false
            let lastSeq = -1
            let binding = null
            let unsubscribeSnapshot = null
            let unsubscribeEvents = null

            activity.setBridged(sessionId, true)

            function maxSeqOf(windowSnapshot) {
              if (!windowSnapshot || !Array.isArray(windowSnapshot.entries)) return -1
              let max = -1
              for (let index = 0; index < windowSnapshot.entries.length; index += 1) {
                const entry = windowSnapshot.entries[index]
                if (!entry || entry.type !== 'event' || !entry.event) continue
                if (typeof entry.event.seq === 'number' && entry.event.seq > max) max = entry.event.seq
              }
              return max
            }

            /** Establish state from a history page without firing transients. */
            function seedFromWindow(windowSnapshot) {
              let openTurnStart = 0
              const entries = (windowSnapshot && windowSnapshot.entries) || []
              for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index]
                if (!entry || entry.type !== 'event' || !entry.event) continue
                if (entry.event.type === 'turn/start') openTurnStart = eventTime(entry.event)
                else if (entry.event.type === 'turn/end') openTurnStart = 0
              }
              if (openTurnStart) activity.adoptTurnStart(sessionId, openTurnStart)
              lastSeq = maxSeqOf(windowSnapshot)
            }

            /** Fold event seqs newer than the cursor, oldest first. */
            function consumeWindow(windowSnapshot) {
              if (!windowSnapshot || !Array.isArray(windowSnapshot.entries)) return
              const fresh = []
              for (let index = 0; index < windowSnapshot.entries.length; index += 1) {
                const entry = windowSnapshot.entries[index]
                if (!entry || entry.type !== 'event' || !entry.event) continue
                const seq = entry.event.seq
                if (typeof seq !== 'number' || seq <= lastSeq) continue
                fresh.push(entry.event)
              }
              if (fresh.length > 0) {
                fresh.sort(function (left, right) {
                  return left.seq - right.seq
                })
                for (let index = 0; index < fresh.length; index += 1) {
                  applySessionEvent(activity, sessionId, fresh[index])
                }
                lastSeq = fresh[fresh.length - 1].seq
              }
              const max = maxSeqOf(windowSnapshot)
              if (max > lastSeq) lastSeq = max
            }

            function detach() {
              if (unsubscribeSnapshot) {
                try {
                  unsubscribeSnapshot()
                } catch (error) {
                  /* already disposed */
                }
                unsubscribeSnapshot = null
              }
              if (unsubscribeEvents) {
                try {
                  unsubscribeEvents()
                } catch (error) {
                  /* already disposed */
                }
                unsubscribeEvents = null
              }
              binding = null
              seeded = false
              lastSeq = -1
            }

            function scheduleAttach(delay) {
              if (disposed || attachTimer) return
              attachAttempts += 1
              attachTimer = window.setTimeout(function () {
                attachTimer = 0
                attach()
              }, delay)
            }

            function readSnapshot() {
              if (!binding) return
              try {
                const snapshot = binding.session.getSnapshot()
                if (snapshot && typeof snapshot.running === 'boolean') activity.setRunning(sessionId, snapshot.running)
              } catch (error) {
                detach()
                scheduleAttach(500)
              }
            }

            function readEvents() {
              if (!binding) return
              let windowSnapshot
              try {
                windowSnapshot = binding.eventSource.getSnapshot()
              } catch (error) {
                detach()
                scheduleAttach(500)
                return
              }
              if (!windowSnapshot || !Array.isArray(windowSnapshot.entries)) return
              if (!seeded) {
                if (windowSnapshot.entries.length === 0) {
                  /* The opening history page has not been published yet. */
                  readSnapshot()
                  return
                }
                seedFromWindow(windowSnapshot)
                seeded = true
                readSnapshot()
                return
              }
              const change = windowSnapshot.change
              if (change && change.kind !== 'append') {
                /* replace / prepend / settle: history moved, not a live event. */
                seedFromWindow(windowSnapshot)
                readSnapshot()
                return
              }
              consumeWindow(windowSnapshot)
            }

            function attach() {
              if (disposed) return
              let next = null
              try {
                next = ctx.sessions.binding(sessionId)
              } catch (error) {
                next = null
              }
              if (!next) {
                /* Keep retrying while the bridge is mounted: it never gives up. */
                scheduleAttach(attachAttempts < 40 ? 250 : 2000)
                return
              }
              if (next !== binding) {
                detach()
                binding = next
                attachAttempts = 0
                try {
                  readSnapshot()
                  readEvents()
                  unsubscribeSnapshot = binding.session.subscribe(readSnapshot)
                  unsubscribeEvents = binding.eventSource.subscribe(readEvents)
                } catch (error) {
                  detach()
                  scheduleAttach(500)
                }
                return
              }
              readSnapshot()
              readEvents()
            }

            attach()

            return function () {
              disposed = true
              if (attachTimer) window.clearTimeout(attachTimer)
              detach()
              activity.setBridged(sessionId, false)
            }
          },
          [sessionId],
        )

        return null
      }
    }

    /* ------------------------------------------------------------------ */
    /* Expression rules                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * One expression at a time, highest priority first:
     *   被戳疼 > 聊天中（委屈 / 得意 / 庆祝）> 调试强制 > DSH 状态 > 困了 > 日常微笑
     *
     * 3.0 chat moods outrank everything except a physical poke: while the user is
     * talking to her, a sad/mean message shows 「委屈含泪」, a streaming answer
     * shows 「得意眯眼笑」 and a finished answer shows the 2-second 「开心庆祝」 —
     * even at 3 a.m., when the idle face is 「困了」. Once the chat mood expires the
     * night sleepiness returns. Chat moods also beat the 2.0 debug override so a
     * stale `dsh.desktop-pet.xjn.forceExpression` can never hide them.
     *
     * `running` outranks 「开心庆祝」 on purpose: a new turn that starts within
     * the celebration window must show thinking, not a stale cheer.
     */
    function resolveExpression(activity, now, ouchUntil, debug, chatMood) {
      if (ouchUntil && now < ouchUntil) return 'ouch'
      if (chatMood && chatMood.sadUntil && now < chatMood.sadUntil) return 'teary'
      if (chatMood && chatMood.streaming) return 'smug'
      if (chatMood && chatMood.cheerUntil && now < chatMood.cheerUntil) return 'cheer'
      if (debug.expression) return debug.expression
      const rejectedAt = activity.rejectedAt()
      if (rejectedAt && now - rejectedAt < TEARY_MS) return 'teary'
      if (activity.running()) {
        let start = activity.earliestStart()
        /* A remote browser clock must not turn a fresh turn into a long one. */
        if (start > now) start = now
        if (start && now - start > debug.longTaskMs) return 'brokecry'
        return 'smug'
      }
      const completedAt = activity.completedAt()
      if (completedAt && now - completedAt < CHEER_MS) return 'cheer'
      if (isNightTime(now)) return 'sleepy'
      return 'smile'
    }

    /* ------------------------------------------------------------------ */
    /* Artwork layer: PNG still underneath, animation on top               */
    /* ------------------------------------------------------------------ */

    function PetArtwork(props) {
      const src = props.src
      const stillSrc = props.stillSrc
      const videoRef = React.useRef(null)
      const [playing, setPlaying] = React.useState(false)
      const [stillBroken, setStillBroken] = React.useState(false)
      const lastSrcRef = React.useRef(src)
      const lastStillRef = React.useRef(stillSrc)

      /* A new expression must fall back to its PNG until the WebM can play. */
      if (lastSrcRef.current !== src) {
        lastSrcRef.current = src
        if (playing) setPlaying(false)
      }
      /* Retry the still whenever the artwork changes. */
      if (lastStillRef.current !== stillSrc) {
        lastStillRef.current = stillSrc
        if (stillBroken) setStillBroken(false)
      }

      React.useEffect(
        function () {
          const node = videoRef.current
          if (!node) return undefined
          function markPlaying() {
            setPlaying(true)
          }
          function markStalled() {
            setPlaying(false)
          }
          node.addEventListener('playing', markPlaying)
          node.addEventListener('waiting', markStalled)
          node.addEventListener('stalled', markStalled)
          node.addEventListener('emptied', markStalled)
          node.addEventListener('error', markStalled)
          try {
            node.muted = true
            node.defaultMuted = true
            const promise = node.play()
            if (promise && typeof promise.catch === 'function') {
              promise.catch(function () {
                setPlaying(false)
              })
            }
          } catch (error) {
            /* autoplay refusal leaves the PNG still visible */
            setPlaying(false)
          }
          return function () {
            node.removeEventListener('playing', markPlaying)
            node.removeEventListener('waiting', markStalled)
            node.removeEventListener('stalled', markStalled)
            node.removeEventListener('emptied', markStalled)
            node.removeEventListener('error', markStalled)
          }
        },
        [src],
      )

      /* Last-resort artwork drawn in code: keeps the pet visible even if the
       * asset route is momentarily unavailable and both media files fail. */
      const fallback = h(
        'svg',
        { className: 'dsh-pet-fallback', viewBox: '0 0 120 120', 'aria-hidden': 'true', focusable: 'false' },
        h('circle', { cx: 60, cy: 62, r: 38, fill: '#8fd4f2' }),
        h('ellipse', { cx: 60, cy: 84, rx: 26, ry: 16, fill: '#eaf8ff' }),
        h('ellipse', { cx: 46, cy: 58, rx: 5.5, ry: 7, fill: '#23323f' }),
        h('ellipse', { cx: 74, cy: 58, rx: 5.5, ry: 7, fill: '#23323f' }),
        h('circle', { cx: 44.5, cy: 55.5, r: 1.8, fill: '#ffffff' }),
        h('circle', { cx: 72.5, cy: 55.5, r: 1.8, fill: '#ffffff' }),
        h('ellipse', { cx: 36, cy: 68, rx: 5, ry: 3, fill: '#ff9fb8', opacity: 0.6 }),
        h('ellipse', { cx: 84, cy: 68, rx: 5, ry: 3, fill: '#ff9fb8', opacity: 0.6 }),
        h('path', {
          d: 'M52 71q8 7 16 0',
          fill: 'none',
          stroke: '#23323f',
          strokeWidth: 2.6,
          strokeLinecap: 'round',
        }),
      )

      return h(
        'div',
        { className: 'dsh-pet-art' + (playing ? ' is-video' : '') },
        stillBroken
          ? fallback
          : h('img', {
              className: 'dsh-pet-img',
              src: stillSrc,
              alt: '',
              draggable: false,
              'aria-hidden': 'true',
              onError: function () {
                setStillBroken(true)
              },
            }),
        h('video', {
          key: src,
          ref: videoRef,
          className: 'dsh-pet-video',
          src: src,
          autoPlay: true,
          loop: true,
          muted: true,
          playsInline: true,
          preload: 'auto',
          tabIndex: -1,
          'aria-hidden': 'true',
        }),
      )
    }

    /* ------------------------------------------------------------------ */
    /* The pet                                                             */
    /* ------------------------------------------------------------------ */

    function PetView(props) {
      const t = props.t
      const lang = typeof props.lang === 'function' ? props.lang() : 'zh'
      const activity = props.activity
      const onExit = props.onExit
      const ensureLocale = props.ensureLocale
      const watchLocale = props.watchLocale

      const anchorRef = React.useRef(null)
      const popupRef = React.useRef(null)
      const chatBoxRef = React.useRef(null)
      const chatInputRef = React.useRef(null)
      const runtimeRef = React.useRef(null)
      if (runtimeRef.current === null) {
        const width = window.innerWidth || 0
        const height = window.innerHeight || 0
        const saved = readSavedPos()
        const maxX = Math.max(MARGIN, width - MARGIN)
        const maxY = Math.max(MARGIN, height - MARGIN)
        const startX = saved ? saved.fx * width : width * 0.78
        const startY = saved ? saved.fy * height : height * 0.72
        runtimeRef.current = {
          pos: {
            x: Math.min(maxX, Math.max(MARGIN, startX)),
            y: Math.min(maxY, Math.max(MARGIN, startY)),
          },
          drag: null,
          taps: [],
          lastTapAt: 0,
          phraseTimer: 0,
          openChatTimer: 0,
          seq: 0,
          sayTimer: 0,
          quitTimer: 0,
          chatAbort: null,
          chatBubbleTimer: 0,
          chatSad: false,
          chatOpenedAt: 0,
        }
      }

      const [hidden, setHidden] = React.useState(readHidden)
      const [say, setSay] = React.useState(null)
      const [menu, setMenu] = React.useState(null)
      const [dragging, setDragging] = React.useState(false)
      const [combo, setCombo] = React.useState(readCombo)
      const [ouchUntil, setOuchUntil] = React.useState(0)
      const [chat, setChat] = React.useState({ open: false, input: '', streaming: false, reply: '', error: false })
      const [mood, setMood] = React.useState({ sadUntil: 0, cheerUntil: 0 })
      const [, forceTick] = React.useState(0)

      function tick() {
        forceTick(function (value) {
          return value + 1
        })
      }

      function clearTimers() {
        const runtime = runtimeRef.current
        if (runtime.sayTimer) window.clearTimeout(runtime.sayTimer)
        if (runtime.quitTimer) window.clearTimeout(runtime.quitTimer)
        if (runtime.chatBubbleTimer) window.clearTimeout(runtime.chatBubbleTimer)
        if (runtime.phraseTimer) window.clearTimeout(runtime.phraseTimer)
        if (runtime.openChatTimer) window.clearTimeout(runtime.openChatTimer)
        runtime.sayTimer = 0
        runtime.quitTimer = 0
        runtime.chatBubbleTimer = 0
        runtime.phraseTimer = 0
        runtime.openChatTimer = 0
      }

      /* ---- geometry ------------------------------------------------- */

      function clampPos(point) {
        const width = window.innerWidth || 0
        const height = window.innerHeight || 0
        const maxX = Math.max(MARGIN, width - MARGIN)
        const maxY = Math.max(MARGIN, height - MARGIN)
        point.x = Math.min(maxX, Math.max(MARGIN, point.x))
        point.y = Math.min(maxY, Math.max(MARGIN, point.y))
        return point
      }

      function applyTransform() {
        const node = anchorRef.current
        if (!node) return
        const pos = runtimeRef.current.pos
        node.style.transform = 'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)'
      }

      function persistPos() {
        const width = window.innerWidth || 1
        const height = window.innerHeight || 1
        const pos = runtimeRef.current.pos
        writeStorage(POS_KEY, JSON.stringify({ fx: pos.x / width, fy: pos.y / height }))
      }

      /** The small chat box sits beside the pet, flipping to stay on screen. */
      function chatBoxPosition() {
        const width = 246
        const pos = runtimeRef.current.pos
        const viewportWidth = window.innerWidth || 0
        const viewportHeight = window.innerHeight || 0
        let left = pos.x + BOX / 2 - 6
        if (left + width > viewportWidth - 8) left = pos.x - BOX / 2 - width + 6
        left = Math.min(Math.max(8, left), Math.max(8, viewportWidth - width - 8))
        const top = Math.min(Math.max(8, pos.y - 20), Math.max(8, viewportHeight - 46))
        return { left: left + 'px', top: top + 'px' }
      }

      /* ---- talking --------------------------------------------------- */

      function sayText(text) {
        const runtime = runtimeRef.current
        runtime.seq += 1
        setSay({ key: runtime.seq, text: text })
        if (runtime.sayTimer) window.clearTimeout(runtime.sayTimer)
        runtime.sayTimer = window.setTimeout(function () {
          runtime.sayTimer = 0
          setSay(null)
        }, SAY_MS)
      }

      function randomPhrase() {
        const index = Math.floor(Math.random() * PHRASE_COUNT)
        sayText(t('phrase.' + index))
      }

      function clearPhraseTimer() {
        const runtime = runtimeRef.current
        if (runtime.phraseTimer) window.clearTimeout(runtime.phraseTimer)
        runtime.phraseTimer = 0
      }

      function cancelScheduledChat() {
        const runtime = runtimeRef.current
        if (runtime.openChatTimer) window.clearTimeout(runtime.openChatTimer)
        runtime.openChatTimer = 0
      }

      /**
       * Open the chat box a beat after the double-click is recognised so that a
       * rapid third tap (「连戳喊疼」) cancels it instead of flashing it open.
       */
      function scheduleOpenChat() {
        const runtime = runtimeRef.current
        cancelScheduledChat()
        runtime.openChatTimer = window.setTimeout(function () {
          runtime.openChatTimer = 0
          openChatInput()
        }, OPEN_CHAT_DELAY_MS)
      }

      /**
       * Tap bookkeeping for 3.0:
       *   - 3 taps inside the window → 「被戳疼」 (2.0 behaviour, unchanged);
       *   - 2 taps inside DOUBLE_TAP_MS → schedule the chat box (double-click);
       *   - 1 tap → the usual random phrase, delayed just enough to rule out a
       *     double-click so a double-click never fires a stray phrase first.
       */
      function handleTap() {
        const runtime = runtimeRef.current
        const now = Date.now()
        runtime.taps = runtime.taps.filter(function (at) {
          return now - at < TAP_WINDOW_MS
        })
        runtime.taps.push(now)
        if (runtime.taps.length >= TAP_COUNT) {
          runtime.taps = []
          runtime.lastTapAt = 0
          clearPhraseTimer()
          cancelScheduledChat()
          setOuchUntil(now + OUCH_MS)
          sayText(t('ouch'))
          return
        }
        if (runtime.lastTapAt && now - runtime.lastTapAt < DOUBLE_TAP_MS) {
          runtime.lastTapAt = 0
          clearPhraseTimer()
          scheduleOpenChat()
          return
        }
        runtime.lastTapAt = now
        clearPhraseTimer()
        runtime.phraseTimer = window.setTimeout(function () {
          runtime.phraseTimer = 0
          randomPhrase()
        }, PHRASE_DELAY_MS)
      }

      /* ---- local-brain chat ------------------------------------------- */

      function clearChatBubbleTimer() {
        const runtime = runtimeRef.current
        if (runtime.chatBubbleTimer) window.clearTimeout(runtime.chatBubbleTimer)
        runtime.chatBubbleTimer = 0
      }

      function abortChatRequest() {
        const runtime = runtimeRef.current
        const controller = runtime.chatAbort
        runtime.chatAbort = null
        if (controller) {
          try {
            controller.abort()
          } catch (error) {
            /* already settled */
          }
        }
      }

      function openChatInput() {
        cancelScheduledChat()
        clearPhraseTimer()
        clearChatBubbleTimer()
        /* A slow double-click may already have flashed a phrase: drop it so the
         * box opens cleanly. */
        const runtime = runtimeRef.current
        runtime.chatOpenedAt = Date.now()
        if (runtime.sayTimer) {
          window.clearTimeout(runtime.sayTimer)
          runtime.sayTimer = 0
        }
        setSay(null)
        setChat(function (previous) {
          return {
            open: true,
            input: previous.input,
            streaming: previous.streaming,
            reply: previous.reply,
            error: previous.error,
          }
        })
      }

      function closeChatInput() {
        setChat(function (previous) {
          return {
            open: false,
            input: previous.input,
            streaming: previous.streaming,
            reply: previous.reply,
            error: previous.error,
          }
        })
      }

      function updateChatReply(text) {
        setChat(function (previous) {
          if (!previous.streaming) return previous
          return {
            open: previous.open,
            input: previous.input,
            streaming: true,
            reply: text,
            error: false,
          }
        })
      }

      /** Settle one request: record the round, award the mood, arm the fade. */
      function finalizeChat(userText, replyText, failed) {
        const runtime = runtimeRef.current
        runtime.chatAbort = null
        clearChatBubbleTimer()
        if (failed) {
          /* Ollama down, refused, timed out: a soft line, never an error. */
          setChat(function (previous) {
            return {
              open: previous.open,
              input: previous.input,
              streaming: false,
              reply: t('brain.asleep'),
              error: true,
            }
          })
          runtime.chatBubbleTimer = window.setTimeout(function () {
            runtime.chatBubbleTimer = 0
            setChat(function (previous) {
              if (!previous.error) return previous
              return {
                open: previous.open,
                input: previous.input,
                streaming: false,
                reply: '',
                error: false,
              }
            })
          }, BRAIN_ASLEEP_MS)
          return
        }
        let text = replyText.trim()
        if (text.length === 0) text = t('brain.empty')
        rememberChatRound(userText, text)
        setChat(function (previous) {
          return {
            open: previous.open,
            input: previous.input,
            streaming: false,
            reply: text,
            error: false,
          }
        })
        const sad = !!runtime.chatSad
        runtime.chatSad = false
        setMood(function (previous) {
          /* A hurt user earns teary eyes for a full window after the answer. */
          if (sad) return { sadUntil: Date.now() + CHAT_SAD_MS, cheerUntil: 0 }
          return { sadUntil: previous.sadUntil, cheerUntil: Date.now() + CHAT_CHEER_MS }
        })
        runtime.chatBubbleTimer = window.setTimeout(function () {
          runtime.chatBubbleTimer = 0
          setChat(function (previous) {
            if (previous.streaming) return previous
            return {
              open: previous.open,
              input: previous.input,
              streaming: false,
              reply: '',
              error: false,
            }
          })
        }, CHAT_BUBBLE_MS)
      }

      /**
       * One streaming request to this package's Host-half brain route. The Host
       * half is the only side that talks to the local Ollama: it fixes the model,
       * `think:false`, `options:{num_gpu:0}` and the upstream address.
       */
      async function streamChatRequest(userText, controller) {
        let text = ''
        let failed = false
        let capped = false
        let timedOut = false
        let watchdog = 0
        try {
          watchdog = window.setTimeout(function () {
            timedOut = true
            try {
              controller.abort()
            } catch (error) {
              /* already settled */
            }
          }, BRAIN_TIMEOUT_MS)
          const response = await fetch(BRAIN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            /* Only `messages` is trusted by the route; the fixed model/controls
             * are set again by this package's Host half (the authority). */
            body: JSON.stringify({
              model: BRAIN_MODEL,
              messages: composeChatMessages(userText),
              stream: true,
              think: false,
              options: BRAIN_OPTIONS,
            }),
            signal: controller.signal,
          })
          if (!response.ok || !response.body || typeof response.body.getReader !== 'function') {
            failed = true
          } else {
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let finished = false
            while (!finished) {
              const chunk = await reader.read()
              if (chunk.done) break
              buffer += decoder.decode(chunk.value, { stream: true })
              let newline = buffer.indexOf('\n')
              while (newline >= 0) {
                const line = buffer.slice(0, newline).trim()
                buffer = buffer.slice(newline + 1)
                newline = buffer.indexOf('\n')
                if (line.length === 0) continue
                const payload = parseStreamLine(line)
                if (!payload) continue
                if (payload.done === true) {
                  finished = true
                  break
                }
                const delta = payload.message && payload.message.content
                if (typeof delta !== 'string' || delta.length === 0) continue
                const grown = appendCapped(text, delta)
                text = grown.text
                updateChatReply(text)
                if (grown.capped) {
                  /* Her 40-character limit is a promise: stop generating and
                   * finalize with exactly what fits. */
                  finished = true
                  capped = true
                  break
                }
              }
            }
            /* The stream may end on a line without a trailing newline. */
            const tail = buffer.trim()
            if (!finished && tail.length > 0) {
              const payload = parseStreamLine(tail)
              const delta = payload && payload.message && payload.message.content
              if (typeof delta === 'string' && delta.length > 0) {
                const grown = appendCapped(text, delta)
                text = grown.text
                updateChatReply(text)
              }
            }
            try {
              reader.cancel()
            } catch (error) {
              /* stream already finished */
            }
            if (capped) {
              try {
                controller.abort()
              } catch (error) {
                /* already settled */
              }
            }
          }
        } catch (error) {
          /* A hide/quit/close aborts on purpose and must stay silent. */
          if (runtimeRef.current.chatAbort !== controller) return
          failed = timedOut || text.length === 0
        } finally {
          if (watchdog) window.clearTimeout(watchdog)
        }
        if (runtimeRef.current.chatAbort !== controller) return
        finalizeChat(userText, text, failed)
      }

      function sendChat() {
        const runtime = runtimeRef.current
        if (runtime.chatAbort) return
        const text = chat.input.trim()
        if (text.length === 0) return
        const sad = detectSadOrMean(text)
        runtime.chatSad = sad
        clearChatBubbleTimer()
        setMood(function (previous) {
          return {
            sadUntil: sad ? Date.now() + CHAT_SAD_MS : previous.sadUntil,
            cheerUntil: 0,
          }
        })
        setChat(function (previous) {
          return { open: true, input: '', streaming: true, reply: '', error: false }
        })
        const controller = new AbortController()
        runtime.chatAbort = controller
        streamChatRequest(text, controller).catch(function () {
          /* never let a promise rejection surface as an unhandled error */
        })
      }

      /* ---- dragging --------------------------------------------------- */

      function onPointerDown(event) {
        if (event.button !== 0 || event.isPrimary === false) return
        const runtime = runtimeRef.current
        /* Keep the composer's focus where it was: a pet click is not a focus move. */
        event.preventDefault()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch (error) {
          /* capture is an enhancement, not a requirement */
        }
        runtime.drag = {
          id: event.pointerId,
          sx: event.clientX,
          sy: event.clientY,
          ox: runtime.pos.x,
          oy: runtime.pos.y,
          moved: 0,
        }
        setDragging(true)
      }

      function onPointerMove(event) {
        const runtime = runtimeRef.current
        const drag = runtime.drag
        if (!drag || drag.id !== event.pointerId) return
        const dx = event.clientX - drag.sx
        const dy = event.clientY - drag.sy
        const moved = Math.sqrt(dx * dx + dy * dy)
        if (moved > drag.moved) drag.moved = moved
        runtime.pos.x = drag.ox + dx
        runtime.pos.y = drag.oy + dy
        clampPos(runtime.pos)
        applyTransform()
      }

      function onPointerUp(event) {
        const runtime = runtimeRef.current
        const drag = runtime.drag
        if (!drag || drag.id !== event.pointerId) return
        runtime.drag = null
        setDragging(false)
        try {
          event.currentTarget.releasePointerCapture(event.pointerId)
        } catch (error) {
          /* already released */
        }
        if (drag.moved < 6) handleTap()
        else persistPos()
      }

      function onPointerCancel(event) {
        const runtime = runtimeRef.current
        const drag = runtime.drag
        if (!drag || drag.id !== event.pointerId) return
        runtime.drag = null
        setDragging(false)
        persistPos()
      }

      /* ---- look ------------------------------------------------------- */

      function chooseColor(colorId) {
        if (!comboAvailable(colorId, combo.outfit)) return
        const next = { color: colorId, outfit: combo.outfit }
        setCombo(next)
        writeStorage(COLOR_KEY, next.color)
        writeStorage(OUTFIT_KEY, next.outfit)
        setMenu(null)
      }

      function chooseOutfit(outfitId) {
        if (!comboAvailable(combo.color, outfitId)) return
        const next = { color: combo.color, outfit: outfitId }
        setCombo(next)
        writeStorage(COLOR_KEY, next.color)
        writeStorage(OUTFIT_KEY, next.outfit)
        setMenu(null)
      }

      /* ---- context menu ----------------------------------------------- */

      function openMenuAt(clientX, clientY) {
        const width = 186
        const height = 205
        const viewportWidth = window.innerWidth || 0
        const viewportHeight = window.innerHeight || 0
        setMenu({
          x: Math.max(8, Math.min(clientX, viewportWidth - width - 8)),
          y: Math.max(8, Math.min(clientY, viewportHeight - height - 8)),
          sub: null,
        })
      }

      function openMenu(event) {
        event.preventDefault()
        event.stopPropagation()
        openMenuAt(event.clientX, event.clientY)
      }

      function hidePet() {
        const runtime = runtimeRef.current
        if (runtime.sayTimer) {
          window.clearTimeout(runtime.sayTimer)
          runtime.sayTimer = 0
        }
        clearPhraseTimer()
        cancelScheduledChat()
        abortChatRequest()
        setMenu(null)
        setSay(null)
        setChat(function (previous) {
          return {
            open: false,
            input: previous.input,
            streaming: false,
            reply: '',
            error: false,
          }
        })
        setHidden(true)
      }

      function recallPet() {
        setHidden(false)
      }

      function quitPet() {
        const runtime = runtimeRef.current
        setMenu(null)
        if (runtime.quitTimer) return
        clearPhraseTimer()
        cancelScheduledChat()
        abortChatRequest()
        setChat(function (previous) {
          return {
            open: false,
            input: previous.input,
            streaming: false,
            reply: '',
            error: false,
          }
        })
        sayText(t('farewell'))
        runtime.quitTimer = window.setTimeout(function () {
          runtime.quitTimer = 0
          try {
            onExit()
          } catch (error) {
            /* the slot disposer is idempotent */
          }
        }, FAREWELL_MS)
      }

      /* ---- effects ---------------------------------------------------- */

      const chatOpen = chat.open

      React.useEffect(function () {
        const runtime = runtimeRef.current
        clampPos(runtime.pos)
        applyTransform()
        try {
          ensureLocale()
        } catch (error) {
          /* built-in dictionaries still cover every string */
        }

        function onResize() {
          clampPos(runtime.pos)
          applyTransform()
          /* Re-render so the chat box re-anchors beside the pet. */
          tick()
        }

        window.addEventListener('resize', onResize)
        return function () {
          window.removeEventListener('resize', onResize)
          /* Leaving the page must never keep a CPU-only generation running. */
          cancelScheduledChat()
          clearPhraseTimer()
          clearChatBubbleTimer()
          abortChatRequest()
          clearTimers()
        }
      }, [])

      React.useEffect(
        function () {
          writeStorage(HIDDEN_KEY, hidden ? '1' : '0')
        },
        [hidden],
      )

      /* Re-render on activity changes and on a slow clock (timed expressions). */
      React.useEffect(function () {
        const unsubscribe = activity.subscribe(tick)
        return function () {
          unsubscribe()
        }
      }, [])

      React.useEffect(
        function () {
          if (hidden) return undefined
          const timer = window.setInterval(tick, 500)
          return function () {
            window.clearInterval(timer)
          }
        },
        [hidden],
      )

      /* Re-render the pet chrome when the active locale changes. */
      React.useEffect(
        function () {
          if (typeof watchLocale !== 'function') return undefined
          let stop = null
          try {
            stop = watchLocale(tick)
          } catch (error) {
            return undefined
          }
          return function () {
            if (typeof stop === 'function') stop()
          }
        },
        [],
      )

      /* Dismiss the popup on outside press, Escape, scroll, resize or blur.
       * Depends on "open" only: submenu hover must not re-add listeners or
       * yank focus back to the first button. */
      const menuOpen = menu !== null
      React.useEffect(
        function () {
          if (!menuOpen) return undefined
          function onDown(event) {
            const node = popupRef.current
            if (node && event.target && node.contains(event.target)) return
            setMenu(null)
          }
          function onKey(event) {
            if (event.key === 'Escape') setMenu(null)
          }
          function dismiss() {
            setMenu(null)
          }
          document.addEventListener('pointerdown', onDown, true)
          document.addEventListener('keydown', onKey, true)
          window.addEventListener('scroll', dismiss, true)
          window.addEventListener('resize', dismiss)
          window.addEventListener('blur', dismiss)
          const node = popupRef.current
          if (node) {
            const first = node.querySelector('button')
            if (first && typeof first.focus === 'function') {
              try {
                first.focus()
              } catch (error) {
                /* focus is an enhancement, not a requirement */
              }
            }
          }
          return function () {
            document.removeEventListener('pointerdown', onDown, true)
            document.removeEventListener('keydown', onKey, true)
            window.removeEventListener('scroll', dismiss, true)
            window.removeEventListener('resize', dismiss)
            window.removeEventListener('blur', dismiss)
          }
        },
        [menuOpen],
      )

      /* Focus the chat input the moment the box opens. */
      React.useEffect(
        function () {
          if (!chatOpen) return undefined
          const node = chatInputRef.current
          if (node && typeof node.focus === 'function') {
            try {
              node.focus()
            } catch (error) {
              /* focus is an enhancement, not a requirement */
            }
          }
          return undefined
        },
        [chatOpen],
      )

      /* Close the chat box on Escape or on a press that is genuinely elsewhere.
       * Scroll/resize must NOT close it: DSH layout churn (and the focus change
       * from opening the input) used to make it vanish by itself. */
      React.useEffect(
        function () {
          if (!chatOpen) return undefined
          function onDown(event) {
            const box = chatBoxRef.current
            if (box && event.target && box.contains(event.target)) return
            const petNode = anchorRef.current
            if (petNode && event.target && petNode.contains(event.target)) return
            const runtime = runtimeRef.current
            if (runtime.chatOpenedAt && Date.now() - runtime.chatOpenedAt < CHAT_OPEN_GRACE_MS) return
            closeChatInput()
          }
          function onKey(event) {
            if (event.key === 'Escape') closeChatInput()
          }
          document.addEventListener('pointerdown', onDown, true)
          document.addEventListener('keydown', onKey, true)
          return function () {
            document.removeEventListener('pointerdown', onDown, true)
            document.removeEventListener('keydown', onKey, true)
          }
        },
        [chatOpen],
      )

      /* Finish a drag even when the pointer is released outside the window. */
      React.useEffect(
        function () {
          if (!dragging) return undefined
          function finish() {
            const runtime = runtimeRef.current
            if (!runtime.drag) return
            runtime.drag = null
            setDragging(false)
            persistPos()
          }
          window.addEventListener('pointerup', finish)
          window.addEventListener('pointercancel', finish)
          window.addEventListener('blur', finish)
          return function () {
            window.removeEventListener('pointerup', finish)
            window.removeEventListener('pointercancel', finish)
            window.removeEventListener('blur', finish)
          }
        },
        [dragging],
      )

      /* ---- render ---------------------------------------------------- */

      const now = Date.now()
      const debug = readDebug()
      const expression = resolveExpression(activity, now, ouchUntil, debug, {
        streaming: chat.streaming,
        sadUntil: mood.sadUntil,
        cheerUntil: mood.cheerUntil,
      })
      const anim = animSrc(combo.color, combo.outfit, expression)
      const still = pngSrc(combo.color, combo.outfit, expression)
      const tabStill = pngSrc(combo.color, combo.outfit, 'smile')
      const reduced = prefersReducedMotion()

      /* Streaming answer > 2.0 phrases > the last finished answer. */
      let bubble = null
      if (chat.streaming) bubble = { text: chat.reply || t('brain.thinking'), chat: true, streaming: true }
      else if (say) bubble = { text: say.text, chat: false, streaming: false }
      else if (chat.reply) bubble = { text: chat.reply, chat: true, streaming: false }

      function menuItem(options) {
        const className =
          'dsh-pet-menu-item' + (options.disabled ? ' is-disabled' : '') + (options.checked ? ' is-checked' : '')
        const children = [
          h('span', { key: 'label', className: 'dsh-pet-menu-item-label' }, options.label),
          options.checked
            ? h('span', { key: 'check', className: 'dsh-pet-menu-check', 'aria-hidden': 'true' }, '✓')
            : null,
          options.arrow ? h('span', { key: 'arrow', className: 'dsh-pet-menu-arrow', 'aria-hidden': 'true' }, '›') : null,
        ]
        return h(
          'button',
          {
            key: options.key,
            type: 'button',
            className: className,
            role: 'menuitem',
            disabled: !!options.disabled,
            title: options.title || undefined,
            onClick: options.onClick,
            onPointerEnter: options.onPointerEnter,
          },
          children,
        )
      }

      const submenuItems = []
      if (menu && menu.sub === 'color') {
        submenuItems.push(
          h('div', { key: 'title', className: 'dsh-pet-submenu-title' }, t('color.title')),
        )
        for (let index = 0; index < COLORS.length; index += 1) {
          const color = COLORS[index]
          const available = comboAvailable(color.id, combo.outfit)
          submenuItems.push(
            menuItem({
              key: 'color.' + color.id,
              label: colorName(color, lang),
              checked: combo.color === color.id,
              disabled: !available,
              title: available ? undefined : t('menu.unavailable'),
              onClick: function () {
                chooseColor(color.id)
              },
            }),
          )
        }
      }
      if (menu && menu.sub === 'outfit') {
        submenuItems.push(
          h('div', { key: 'title', className: 'dsh-pet-submenu-title' }, t('outfit.title')),
        )
        for (let index = 0; index < OUTFITS.length; index += 1) {
          const outfit = OUTFITS[index]
          const available = comboAvailable(combo.color, outfit.id)
          submenuItems.push(
            menuItem({
              key: 'outfit.' + outfit.id,
              label: outfitName(outfit, lang),
              checked: combo.outfit === outfit.id,
              disabled: !available,
              title: available ? undefined : t('menu.unavailable'),
              onClick: function () {
                chooseOutfit(outfit.id)
              },
            }),
          )
        }
      }

      const submenuFlipLeft =
        !!menu && menu.x + 186 + 6 + 170 > (window.innerWidth || 0)
      /* A submenu opening near the bottom edge grows upwards instead. */
      const submenuFlipUp =
        !!menu && menu.y + 245 > (window.innerHeight || 0) - 8
      const popup = menu
        ? h(
            'div',
            {
              key: 'popup',
              ref: popupRef,
              className: 'dsh-pet-popup',
              style: { left: menu.x + 'px', top: menu.y + 'px' },
            },
            h(
              'div',
              { className: 'dsh-pet-menu', role: 'menu' },
              menuItem({
                key: 'chat',
                label: t('menu.chat'),
                onClick: function () {
                  setMenu(null)
                  openChatInput()
                },
              }),
              h('div', { key: 'sep.chat', className: 'dsh-pet-menu-sep' }),
              menuItem({
                key: 'color',
                label: t('menu.color'),
                arrow: true,
                onClick: function () {
                  setMenu({ x: menu.x, y: menu.y, sub: 'color' })
                },
                onPointerEnter: function () {
                  if (menu.sub === 'color') return
                  setMenu({ x: menu.x, y: menu.y, sub: 'color' })
                },
              }),
              menuItem({
                key: 'outfit',
                label: t('menu.outfit'),
                arrow: true,
                onClick: function () {
                  setMenu({ x: menu.x, y: menu.y, sub: 'outfit' })
                },
                onPointerEnter: function () {
                  if (menu.sub === 'outfit') return
                  setMenu({ x: menu.x, y: menu.y, sub: 'outfit' })
                },
              }),
              h('div', { key: 'sep', className: 'dsh-pet-menu-sep' }),
              menuItem({ key: 'hide', label: t('menu.hide'), onClick: hidePet }),
              menuItem({ key: 'quit', label: t('menu.quit'), onClick: quitPet }),
              menu.sub
                ? h(
                    'div',
                    {
                      key: 'submenu',
                      className:
                        'dsh-pet-menu dsh-pet-submenu' +
                        (submenuFlipLeft ? ' is-left' : '') +
                        (submenuFlipUp ? ' is-up' : ''),
                      role: 'menu',
                    },
                    submenuItems,
                  )
                : null,
            ),
          )
        : null

      const tab = h(
        'button',
        {
          key: 'tab',
          type: 'button',
          className: 'dsh-pet-tab',
          title: t('tab.recall'),
          'aria-label': t('tab.recall'),
          onClick: recallPet,
          onContextMenu: function (event) {
            event.preventDefault()
          },
        },
        h('img', { src: tabStill, alt: '', draggable: false, 'aria-hidden': 'true' }),
      )

      const chatBox = chatOpen
        ? h(
            'div',
            {
              key: 'chatbox',
              ref: chatBoxRef,
              className: 'dsh-pet-chatbox',
              style: chatBoxPosition(),
              role: 'dialog',
              'aria-label': t('chat.label'),
            },
            h('input', {
              key: 'input',
              ref: chatInputRef,
              className: 'dsh-pet-chat-input',
              type: 'text',
              value: chat.input,
              placeholder: t('chat.placeholder'),
              'aria-label': t('chat.label'),
              maxLength: 200,
              autoComplete: 'off',
              spellCheck: false,
              onChange: function (event) {
                const value = event.target.value
                setChat(function (previous) {
                  return {
                    open: previous.open,
                    input: value,
                    streaming: previous.streaming,
                    reply: previous.reply,
                    error: previous.error,
                  }
                })
              },
              onKeyDown: function (event) {
                /* Chinese IME: Enter confirms a candidate, it must not send. */
                const native = event.nativeEvent
                if (native && (native.isComposing || native.keyCode === 229)) return
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendChat()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  closeChatInput()
                }
              },
            }),
            h(
              'button',
              {
                key: 'send',
                type: 'button',
                className: 'dsh-pet-chat-send',
                disabled: chat.streaming || chat.input.trim().length === 0,
                onClick: sendChat,
              },
              t('chat.send'),
            ),
            h(
              'button',
              {
                key: 'close',
                type: 'button',
                className: 'dsh-pet-chat-close',
                title: t('chat.close'),
                'aria-label': t('chat.close'),
                onClick: closeChatInput,
              },
              '×',
            ),
          )
        : null

      const startPos = runtimeRef.current.pos
      const pet = h(
        'div',
        {
          className: 'dsh-pet-anchor',
          ref: anchorRef,
          style: { transform: 'translate3d(' + startPos.x + 'px,' + startPos.y + 'px,0)' },
        },
        h(
          'div',
          {
            className: 'dsh-pet-stage' + (dragging ? ' is-dragging' : '') + (reduced ? ' is-reduced' : ''),
            role: 'button',
            tabIndex: 0,
            'aria-label': t('pet.label'),
            'aria-haspopup': 'menu',
            title: t('pet.hint'),
            onPointerDown: onPointerDown,
            onPointerMove: onPointerMove,
            onPointerUp: onPointerUp,
            onPointerCancel: onPointerCancel,
            onLostPointerCapture: function (event) {
              const runtime = runtimeRef.current
              const drag = runtime.drag
              if (!drag || drag.id !== event.pointerId) return
              runtime.drag = null
              setDragging(false)
              persistPos()
            },
            onContextMenu: openMenu,
            onDoubleClick: function (event) {
              /* Native double-click: open immediately. The tap bookkeeping above
               * covers fast double-clicks; this covers the slow ones. */
              event.preventDefault()
              openChatInput()
            },
            onKeyDown: function (event) {
              if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                openMenuAt(rect.left + rect.width / 2, rect.top + rect.height / 2)
                return
              }
              if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault()
                randomPhrase()
              }
            },
          },
          h(PetArtwork, { src: anim, stillSrc: still }),
          h(
            'div',
            {
              className:
                'dsh-pet-say' +
                (bubble ? ' is-on' : '') +
                (bubble && bubble.chat ? ' is-chat' : '') +
                (bubble && bubble.streaming ? ' is-streaming' : ''),
              role: 'status',
              'aria-live': 'polite',
            },
            bubble ? bubble.text : '',
            bubble && bubble.streaming
              ? h('span', { key: 'caret', className: 'dsh-pet-caret', 'aria-hidden': 'true' })
              : null,
          ),
        ),
      )

      return h(
        React.Fragment,
        null,
        h('style', { key: 'style' }, CSS),
        h('div', { key: 'root', className: 'dsh-pet-root' }, hidden ? tab : pet, popup, chatBox),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Plugin entry                                                        */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        const i18n = createI18n(ctx)
        const t = i18n.t
        i18n.ensure()

        function watchLocale(callback) {
          try {
            const locale = ctx.get('locale')
            if (locale && typeof locale.subscribe === 'function') return locale.subscribe(callback)
          } catch (error) {
            /* the built-in dictionaries still localize every string */
          }
          return function () {}
        }

        const activity = createActivity()
        let disposeSlot = null
        let disposeBridge = null

        function onExit() {
          const disposePet = disposeSlot
          const disposeStatus = disposeBridge
          disposeSlot = null
          disposeBridge = null
          if (typeof disposePet === 'function') disposePet()
          if (typeof disposeStatus === 'function') disposeStatus()
        }

        /*
         * Root fallback: the Session list already carries every Session's running
         * flag, so the pet keeps tracking work while the Conversation (and its
         * bridge) is off-screen — for example on the Settings panel.
         */
        function observeSessionList() {
          let list = null
          try {
            const sessions = ctx.get('sessions')
            list = sessions && sessions.list
          } catch (error) {
            list = null
          }
          if (!list || typeof list.getSnapshot !== 'function' || typeof list.subscribe !== 'function') return
          function sync() {
            let snapshot = null
            try {
              snapshot = list.getSnapshot()
            } catch (error) {
              return
            }
            const byId = snapshot && snapshot.byId
            if (!byId) return
            const alive = {}
            for (const id in byId) {
              if (!Object.prototype.hasOwnProperty.call(byId, id)) continue
              alive[id] = true
              const row = byId[id]
              if (!row || typeof row.running !== 'boolean') continue
              activity.syncRunning(id, row.running)
            }
            activity.prune(alive)
          }
          sync()
          try {
            ctx.effect(function () {
              return list.subscribe(sync)
            }, 'desktop-pet-xiaojingniang: session list fallback')
          } catch (error) {
            /* the list fallback is optional; the Session bridge still works */
          }
        }

        observeSessionList()

        disposeSlot = ctx.slots.inject(SLOT, function () {
          return ctx.slots.register(
            {
              name: SLOT,
              id: ENTRY_ID,
              order: 50,
              label: function () {
                return t('pet.label')
              },
            },
            function (slotProps) {
              return h(
                PetView,
                Object.assign({}, slotProps, {
                  t: t,
                  lang: i18n.lang,
                  activity: activity,
                  onExit: onExit,
                  ensureLocale: i18n.ensure,
                  watchLocale: watchLocale,
                }),
              )
            },
          )
        })

        /*
         * The bridge only observes Session state. Registering it must never take
         * the pet down, so a failure is logged and ignored.
         */
        try {
          const BridgeView = createBridgeView(ctx, activity)
          disposeBridge = ctx.slots.inject(BRIDGE_SLOT, function () {
            return ctx.slots.register(
              { name: BRIDGE_SLOT, id: BRIDGE_ID, order: 900 },
              BridgeView,
            )
          })
        } catch (error) {
          try {
            if (window.console && typeof window.console.error === 'function') {
              window.console.error('[desktop-pet-xiaojingniang] activity bridge unavailable', error)
            }
          } catch (ignored) {
            /* logging must never throw */
          }
        }
      },
    }
  },
})
