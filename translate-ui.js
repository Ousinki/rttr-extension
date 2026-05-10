const fs = require('fs');

const uiDict = {
  "翻译 API 设置": {
    "zh-TW": "翻譯 API 設定",
    "ja": "翻訳 API 設定",
    "en": "Translation API Settings"
  },
  "配置 OpenAI 兼容的接口信息用于长句/段落的 AI 划词翻译。": {
    "zh-TW": "設定相容 OpenAI 的介面資訊，用於長句/段落的 AI 劃詞翻譯。",
    "ja": "OpenAI互換APIを設定し、長文/段落のAI選択翻訳を行います。",
    "en": "Configure OpenAI-compatible API for AI sentence/paragraph translation."
  },
  "AI 长句翻译 API Key (OpenAI 格式)": {
    "zh-TW": "AI 長句翻譯 API Key (OpenAI 格式)",
    "ja": "AI長文翻訳 API Key (OpenAI 形式)",
    "en": "AI Translation API Key (OpenAI Format)"
  },
  "API 端点": {
    "zh-TW": "API 端點",
    "ja": "API エンドポイント",
    "en": "API Endpoint"
  },
  "模型": {
    "zh-TW": "模型",
    "ja": "モデル",
    "en": "Model"
  },
  "测试 API": {
    "zh-TW": "測試 API",
    "ja": "API をテスト",
    "en": "Test API"
  },
  "测试中...": {
    "zh-TW": "測試中...",
    "ja": "テスト中...",
    "en": "Testing..."
  },
  "翻译悬浮窗与引擎": {
    "zh-TW": "翻譯懸浮窗與引擎",
    "ja": "翻訳ポップアップとエンジン",
    "en": "Translation Tooltip & Engine"
  },
  "显示引擎尾标": {
    "zh-TW": "顯示引擎尾標",
    "ja": "エンジンのアイコンを表示",
    "en": "Show Engine Tag"
  },
  "不启用": {
    "zh-TW": "不啟用",
    "ja": "無効",
    "en": "Disabled"
  },
  "直角灰底设计。点击下方卡片选择翻译框的默认弹出位置。": {
    "zh-TW": "直角灰底設計。點擊下方卡片選擇翻譯框的預設彈出位置。",
    "ja": "直角のグレー背景デザイン。下のカードをクリックして翻訳枠のデフォルト表示位置を選択します。",
    "en": "Square gray-background design. Click the card below to select the default popup position."
  },
  "显示于文字下方": {
    "zh-TW": "顯示於文字下方",
    "ja": "テキストの下に表示",
    "en": "Show below text"
  },
  "显示于文字上方": {
    "zh-TW": "顯示於文字上方",
    "ja": "テキストの上に表示",
    "en": "Show above text"
  },
  "划词翻译模式": {
    "zh-TW": "劃詞翻譯模式",
    "ja": "選択翻訳モード",
    "en": "Selection Translation Mode"
  },
  "配置拖动选中文本时的翻译行为。翻译悬浮窗与发音相互独立，可同时启用。": {
    "zh-TW": "設定拖曳選取文字時的翻譯行為。翻譯懸浮窗與發音互不影響，可同時啟用。",
    "ja": "テキストを選択した時の翻訳動作を設定します。翻訳ポップアップと発音は独立しており、同時有効化が可能です。",
    "en": "Configure translation behavior when selecting text. Translation tooltip and pronunciation are independent and can be enabled together."
  },
  "选中自动翻译": {
    "zh-TW": "選中自動翻譯",
    "ja": "選択時自動翻訳",
    "en": "Auto-translate on select"
  },
  "锁定目光": {
    "zh-TW": "鎖定目光",
    "ja": "視線を固定",
    "en": "Eye-tracking lock"
  },
  "选中点击翻译": {
    "zh-TW": "選中點擊翻譯",
    "ja": "選択後クリック翻訳",
    "en": "Click to translate on select"
  },
  "长按 AI 翻译": {
    "zh-TW": "長按 AI 翻譯",
    "ja": "長押し AI 翻訳",
    "en": "Long-press AI translate"
  },
  "语境搭配分析": {
    "zh-TW": "語境搭配分析",
    "ja": "文脈コロケーション分析",
    "en": "Contextual Collocation Analysis"
  },
  "(锁定目光)": {
    "zh-TW": "(鎖定目光)",
    "ja": "(視線を固定)",
    "en": "(Eye-tracking lock)"
  },
  "划词发音模式": {
    "zh-TW": "劃詞發音模式",
    "ja": "選択発音モード",
    "en": "Selection Pronunciation Mode"
  },
  "配置拖动选中文本时的发音行为。直接点击下方卡片即可切换模式。": {
    "zh-TW": "設定拖曳選取文字時的發音行為。直接點擊下方卡片即可切換模式。",
    "ja": "テキスト選択時の発音動作を設定します。下のカードをクリックしてモードを切り替えます。",
    "en": "Configure pronunciation behavior when selecting text. Click the cards below to switch modes."
  },
  "单击发音": {
    "zh-TW": "單擊發音",
    "ja": "クリック発音",
    "en": "Click to pronounce"
  },
  "显示音标悬浮窗": {
    "zh-TW": "顯示音標懸浮窗",
    "ja": "発音記号ポップアップを表示",
    "en": "Show phonetic tooltip"
  },
  "选中自动发音": {
    "zh-TW": "選中自動發音",
    "ja": "選択時自動発音",
    "en": "Auto-pronounce on select"
  },
  "选中点击发音": {
    "zh-TW": "選中點擊發音",
    "ja": "選択後クリック発音",
    "en": "Click to pronounce on select"
  },
  "快捷键发音": {
    "zh-TW": "快捷鍵發音",
    "ja": "ショートカットキー発音",
    "en": "Shortcut pronunciation"
  },
  "段落翻译与无缝注音": {
    "zh-TW": "段落翻譯與無縫注音",
    "ja": "段落翻訳とシームレスルビ",
    "en": "Paragraph Translation & Seamless Ruby"
  },
  "配置段落翻译的触发快捷键。它能在不破坏原有英文版面的前提下，将中文翻译像拼音一样注入到生词上方。": {
    "zh-TW": "設定段落翻譯的觸發快捷鍵。它能在不破壞原有英文版面的前提下，將翻譯像拼音一樣注入到生詞上方。",
    "ja": "段落翻訳のトリガーショートカットを設定します。元の英語レイアウトを崩さずに、翻訳をルビのように単語の上に挿入します。",
    "en": "Configure the paragraph translation trigger shortcut. It injects translation above unfamiliar words like ruby text without breaking the English layout."
  },
  "触发快捷键": {
    "zh-TW": "觸發快捷鍵",
    "ja": "トリガーショートカット",
    "en": "Trigger Shortcut"
  },
  "请在 Chrome 的扩展快捷键页面设置。": {
    "zh-TW": "請在 Chrome 的擴充功能快捷鍵頁面設定。",
    "ja": "Chromeの拡張機能ショートカットページで設定してください。",
    "en": "Please configure in Chrome's extension shortcuts page."
  },
  "打开快捷键页面": {
    "zh-TW": "打開快捷鍵頁面",
    "ja": "ショートカットページを開く",
    "en": "Open Shortcuts Page"
  },
  "沉浸式 Ruby 注音效果演示": {
    "zh-TW": "沉浸式 Ruby 注音效果展示",
    "ja": "没入型ルビ効果のデモ",
    "en": "Immersive Ruby Effect Demo"
  },
  "语音合成 (TTS) 设置": {
    "zh-TW": "語音合成 (TTS) 設定",
    "ja": "音声合成 (TTS) 設定",
    "en": "Text-to-Speech (TTS) Settings"
  },
  "配置发音人的语言、语速及音量。": {
    "zh-TW": "設定發音人的語言、語速及音量。",
    "ja": "話者の言語、速度、音量を設定します。",
    "en": "Configure voice language, rate, and volume."
  },
  "发音人 (Voice)": {
    "zh-TW": "發音人 (Voice)",
    "ja": "話者 (Voice)",
    "en": "Voice"
  },
  "(系统默认)": {
    "zh-TW": "(系統預設)",
    "ja": "(システムデフォルト)",
    "en": "(System Default)"
  },
  "语言 (Language)": {
    "zh-TW": "語言 (Language)",
    "ja": "言語 (Language)",
    "en": "Language"
  },
  "语速 (Rate):": {
    "zh-TW": "語速 (Rate):",
    "ja": "速度 (Rate):",
    "en": "Rate:"
  },
  "音量 (Volume):": {
    "zh-TW": "音量 (Volume):",
    "ja": "音量 (Volume):",
    "en": "Volume:"
  },
  "测试发音": {
    "zh-TW": "測試發音",
    "ja": "発音テスト",
    "en": "Test Voice"
  },
  "播放中...": {
    "zh-TW": "播放中...",
    "ja": "再生中...",
    "en": "Playing..."
  },
  "✓ 已自动保存": {
    "zh-TW": "✓ 已自動儲存",
    "ja": "✓ 自動保存されました",
    "en": "✓ Auto-saved"
  },
  "当前：": {
    "zh-TW": "當前：",
    "ja": "現在：",
    "en": "Current:"
  },
  "界面与目标语言": {
    "zh-TW": "介面與目標語言",
    "ja": "UI・翻訳言語",
    "en": "UI & Target Language"
  },
  "RTTR 高级设置": {
    "zh-TW": "RTTR 高級設定",
    "ja": "RTTR 詳細設定",
    "en": "RTTR Advanced Settings"
  }
};

let content = fs.readFileSync('entrypoints/options/App.vue', 'utf8');

// Insert dictionary and translation function at the beginning of script setup
const scriptInjection = `
const uiDict: Record<string, Record<string, string>> = ${JSON.stringify(uiDict, null, 2)};

function t(key: string) {
  const lang = settings.value?.targetLanguage || 'zh-CN';
  if (lang === 'zh-CN') return key;
  return uiDict[key]?.[lang] || key;
}
`;
content = content.replace('const settings = ref<RTTRSettings>({', scriptInjection + '\nconst settings = ref<RTTRSettings>({');

// Perform text replacements in the template
for (const key of Object.keys(uiDict)) {
  if (key === '当前：' || key === '语速 (Rate):' || key === '音量 (Volume):' || key === '界面与目标语言' || key === 'RTTR 高级设置') continue;
  
  // Handle literal text in HTML nodes
  const regex = new RegExp('([>\\\\n\\\\s])' + key.replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, '\\\\$&') + '([<\\\\n\\\\s])', 'g');
  content = content.replace(regex, \`$1{{ t('\${key}') }}$2\`);
}

// Manual replacements for trickier parts
content = content.replace(/>当前：/, ">{{ t('当前：') }}");
content = content.replace(/当前：\{\{/, "{{ t('当前：') }} {{");
content = content.replace(/语速 \(Rate\):/g, "{{ t('语速 (Rate):') }}");
content = content.replace(/音量 \(Volume\):/g, "{{ t('音量 (Volume):') }}");
content = content.replace(/'测试中\.\.\.'/g, "t('测试中...')");
content = content.replace(/'测试 API'/g, "t('测试 API')");
content = content.replace(/'播放中\.\.\.'/g, "t('播放中...')");
content = content.replace(/'测试发音'/g, "t('测试发音')");
content = content.replace(/请在 Chrome 的扩展快捷键页面设置。/g, "{{ t('请在 Chrome 的扩展快捷键页面设置。') }}");

fs.writeFileSync('entrypoints/options/App.vue', content);
console.log('App.vue UI text translated');
