# 文件格式

## bible.json

```json
{
  "title": "快递站的猫",
  "aspect": "9:16",
  "style": "cinematic photorealistic film still, modern Chinese small town, soft natural light, realistic skin and fabric texture, shallow depth of field, subtle film grain",
  "negative": "cartoon, anime, text, watermark, logo, extra fingers, deformed hands, blurry face",
  "night_style": "night scene, warm practical lamplight, deep shadows, moonlight through windows",
  "characters": {
    "azhou": {
      "name": "阿舟",
      "prompt": "a 24-year-old Chinese young man, short messy black hair, tired kind eyes, wearing a plain navy-blue work jacket over a white T-shirt, black trousers, a lanyard badge",
      "voice": {"id": "在这里填你的配音服务音色名", "speed": 1.0}
    },
    "mimi": {
      "name": "咪咪",
      "prompt": "a chubby orange tabby cat with a white chest and one bent ear, round amber eyes"
    }
  },
  "scenes": {
    "station": "a small neighbourhood parcel station, metal shelves stacked with brown cardboard boxes, fluorescent ceiling light, no text, no logos",
    "street_night": "a quiet small-town street at night, a single street lamp, wet asphalt reflecting light, no signs with text"
  },
  "night_scenes": ["street_night"],
  "outline": [
    "1 会签收的猫——咪咪每天准时“签收”同一个没人认领的包裹",
    "2 包裹里是什么——阿舟拆开发现一封十年前的信"
  ],
  "notes": "竖屏，单集约 2 分钟，都市温情轻喜剧"
}
```

## ep01.json

```json
{
  "episode": 1,
  "title": "会签收的猫",
  "shots": [
    {"id": "s01", "dur": 3, "type": "insert", "scene": "station", "chars": ["mimi"],
     "image": "close-up of 咪咪 pressing one paw firmly on a brown parcel, staring at camera",
     "motion": "the cat pushes its paw down and blinks slowly"},
    {"id": "s02", "dur": 4, "type": "talk", "scene": "station", "chars": ["azhou"], "ref": "face",
     "image": "close-up of 阿舟 frowning in disbelief, holding a scanner",
     "line": ["azhou", "又是你？这已经是第七天了。"], "emo": "又好气又好笑地小声嘀咕"}
  ]
}
```

## 字段速查

- `type`：`insert`（空镜/环境/物件）、`action`（无台词动作）、`talk`（有台词）
- `line`：`[角色id, 中文台词]`，台词不含括号和方括号
- `ref`：`"face"` 表示只用定妆照参考（特写用）
- 角色在 `image` 里用中文名指代，管线负责替换成 `prompt`
