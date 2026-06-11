<script lang="ts" setup>
import { ref, computed, onMounted, onBeforeUnmount, onUnmounted, nextTick, watch } from 'vue';
import { settingsStorage } from '@/utils/storage';
import type { RTTRSettings } from '@/utils/storage';
import { speakText } from '@/utils/tts';

const uiDict: Record<string, Record<string, string>> = {
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
    "zh-TW": "長按 AI 翻译",
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
    "en": "Configure paragraph translation trigger. It injects translation above unfamiliar words like ruby text without breaking English layout."
  },
  "全局快捷键与段落翻译": {
    "zh-TW": "全域快捷鍵與段落翻譯",
    "ja": "グローバルショートカットと段落翻訳",
    "en": "Global Shortcuts & Paragraph Translation"
  },
  "段落翻译": {
    "zh-TW": "段落翻譯",
    "ja": "段落翻訳",
    "en": "Paragraph Translation"
  },
  "开启/关闭 RTTR": {
    "zh-TW": "開啟/關閉 RTTR",
    "ja": "RTTRのオン/オフ",
    "en": "Toggle RTTR On/Off"
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
  "这是一段翻译结果的演示...": {
    "zh-TW": "這是一段翻譯結果的展示...",
    "ja": "これは翻訳結果のデモです...",
    "en": "This is a demo of the translation result..."
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
  },
  "简体中文 (Simplified)": {
    "zh-TW": "簡體中文 (Simplified)",
    "ja": "簡体字中国語 (Simplified)",
    "en": "Simplified Chinese"
  },
  "繁体中文 (Traditional)": {
    "zh-TW": "繁體中文 (Traditional)",
    "ja": "繁体字中国語 (Traditional)",
    "en": "Traditional Chinese"
  },
  "日本語 (Japanese)": {
    "zh-TW": "日本語 (Japanese)",
    "ja": "日本語 (Japanese)",
    "en": "Japanese"
  },
  "English (English)": {
    "zh-TW": "English (English)",
    "ja": "English (English)",
    "en": "English"
  },
  "API 连接成功！": {
    "zh-TW": "API 連接成功！",
    "ja": "API 接続成功！",
    "en": "API Connected!"
  },
  "未知错误": {
    "zh-TW": "未知錯誤",
    "ja": "不明なエラー",
    "en": "Unknown error"
  },
  "测试成功": {
    "zh-TW": "測試成功",
    "ja": "テスト成功",
    "en": "Test successful"
  },
  "测试失败": {
    "zh-TW": "測試失敗",
    "ja": "テスト失敗",
    "en": "Test failed"
  },
  "假设": {
    "zh-TW": "假設",
    "ja": "仮説",
    "en": "hypothesis"
  },
  "无缝的": {
    "zh-TW": "無縫的",
    "ja": "シームレスな",
    "en": "seamless"
  },
  "上方": {
    "zh-TW": "上方",
    "ja": "上部",
    "en": "above"
  },

  "数字单位转换": {
    "zh-TW": "數字單位轉換",
    "ja": "数値単位変換",
    "en": "Number Unit Conversion"
  },
  "自动识别 100 million、5 billion 等数字并转换为中文计量（1亿、50亿）": {
    "zh-TW": "自動識別 100 million、5 billion 等數字並轉換為中文計量（1億、50億）",
    "ja": "100 million、5 billionなどの数値を自動認識し、中国語の計量単位（1億、50億）に変換",
    "en": "Auto-detect numbers like 100 million, 5 billion and convert to Chinese units (1亿, 50亿)"
  },
  "右键自定义菜单": {
    "zh-TW": "右鍵自訂選單",
    "ja": "右クリックカスタムメニュー",
    "en": "Custom Right-Click Menu"
  },
  "关闭后右键将恢复浏览器原生菜单": {
    "zh-TW": "關閉後右鍵將恢復瀏覽器原生選單",
    "ja": "無効にすると右クリックはブラウザ標準メニューに戻ります",
    "en": "When disabled, right-click will show the browser's native context menu"
  },
  "自定义右键菜单中的搜索快捷按钮。": {
    "zh-TW": "自訂右鍵選單中的搜尋快捷按鈕。",
    "ja": "右クリックカスタムメニューの検索ショートカットボタン。",
    "en": "Search shortcuts in the custom right-click menu."
  },
  "发音后显示音标与翻译": {
    "zh-TW": "發音後顯示音標與翻譯",
    "ja": "発音後に発音記号と翻訳を表示",
    "en": "Show IPA & Translation After Speaking"
  },
  "点击菜单栏发音按钮后，自动显示音标、机器翻译和 AI 语境翻译。适用于链接文本等点击会跳转的场景": {
    "zh-TW": "點擊選單列發音按鈕後，自動顯示音標、機器翻譯和 AI 語境翻譯。適用於連結文字等點擊會跳轉的場景",
    "ja": "メニューの発音ボタンクリック後、発音記号・機械翻訳・AI文脈翻訳を自動表示。リンクテキストなどクリックで遷移する場面に最適",
    "en": "After clicking speak, auto-show IPA, translation & AI context. Useful for link text that would navigate on click"
  },
  "X (Twitter) 搜索": {
    "zh-TW": "X (Twitter) 搜尋",
    "ja": "X（Twitter）検索",
    "en": "Search on X (Twitter)"
  },
  "在自定义右键菜单中显示 X (Twitter) 精准搜索按钮": {
    "zh-TW": "在自訂右鍵選單中顯示 X (Twitter) 精確搜尋按鈕",
    "ja": "右クリックカスタムメニューでX（Twitter）のピンポイント検索ボタンを表示する",
    "en": "Show precise search button on X (Twitter) in the custom right-click menu"
  },
  "Reddit 搜索": {
    "zh-TW": "Reddit 搜尋",
    "ja": "Reddit 検索",
    "en": "Search on Reddit"
  },
  "在自定义右键菜单中显示 Reddit 搜索按钮": {
    "zh-TW": "在自訂右鍵選單中顯示 Reddit 搜尋按鈕",
    "ja": "右クリックカスタムメニューで Reddit 検索ボタンを表示する",
    "en": "Show Reddit search button in the custom right-click menu"
  },
  "Google 搜索": {
    "zh-TW": "Google 搜尋",
    "ja": "Google 検索",
    "en": "Search on Google"
  },
  "在自定义右键菜单中显示 Google 搜索按钮": {
    "zh-TW": "在自訂右鍵選單中顯示 Google 搜尋按鈕",
    "ja": "右クリックカスタムメニューで Google 検索ボタンを表示する",
    "en": "Show Google search button in the custom right-click menu"
  },
  "自定义搜索引擎": {
    "zh-TW": "自訂搜尋引擎",
    "ja": "カスタム検索エンジン",
    "en": "Custom Search Engines"
  },
  "名称": {
    "zh-TW": "名稱",
    "ja": "名前",
    "en": "Name"
  },
  "URL 模板": {
    "zh-TW": "URL 樣板",
    "ja": "URL テンプレート",
    "en": "URL Template"
  },
  "添加搜索引擎": {
    "zh-TW": "新增搜尋引擎",
    "ja": "検索エンジンを追加",
    "en": "Add Search Engine"
  },
  "使用 {query} 作为搜索词占位符": {
    "zh-TW": "使用 {query} 作為搜尋詞佔位符",
    "ja": "{query} を検索語のプレースホルダーとして使用",
    "en": "Use {query} as the search term placeholder"
  },
  "单击断音节": {
    "zh-TW": "單擊斷音節",
    "ja": "クリックで音節分割",
    "en": "Click-to-Syllabify"
  },
  "点击英文单词时自动显示音节划分（如 un·pun·ished）": {
    "zh-TW": "點擊英文單詞時自動顯示音節劃分（如 un·pun·ished）",
    "ja": "英単語をクリックすると音節分割を表示（例：un·pun·ished）",
    "en": "Show syllable breaks when clicking English words (e.g. un·pun·ished)"
  },
  "其他辅助功能": {
    "zh-TW": "其他輔助功能",
    "ja": "その他のアクセシビリティ",
    "en": "Other Accessibility Features"
  },
  "管理浏览器扩展的其他增强体验与功能。": {
    "zh-TW": "管理瀏覽器擴充功能的其他增強體驗與功能。",
    "ja": "ブラウザ拡張機能のその他の強化体験や機能を管理します。",
    "en": "Manage other enhanced experiences and features of the browser extension."
  },
  "展示方式": {
    "zh-TW": "展示方式",
    "ja": "表示方法",
    "en": "Display Mode"
  },
  "气泡内展示 (推荐，零干扰)": {
    "zh-TW": "氣泡內展示 (推薦，零干擾)",
    "ja": "バブル内で表示 (推奨、干渉なし)",
    "en": "Show in tooltip (Recommended, zero interference)"
  },
  "图层覆盖 (如 Mac 原生词典)": {
    "zh-TW": "圖層覆蓋 (如 Mac 原生詞典)",
    "ja": "オーバーレイ表示 (Macの標準辞書のように)",
    "en": "Overlay (Like macOS native dictionary)"
  },
  "行内原位替换 (沉浸感更强)": {
    "zh-TW": "行內原位替換 (沉浸感更強)",
    "ja": "インライン置換 (より没入感のある)",
    "en": "Inline replacement (More immersive)"
  },
  "句子聚焦导航模式": {
    "zh-TW": "句子聚焦導航模式",
    "ja": "文フォーカスナビゲーションモード",
    "en": "Sentence Focus Navigation Mode"
  },
  "右键段落选择「聚焦此句」后，使用方向键控制句子。选择你偏好的左右键行为。": {
    "zh-TW": "右鍵段落選擇「聚焦此句」後，使用方向鍵控制句子。選擇你偏好的左右鍵行為。",
    "ja": "段落を右クリックして「この文にフォーカス」を選択後、方向キーで文を操作します。左右キーの好みの動作を選択してください。",
    "en": "Right-click a paragraph and select 'Focus this sentence', then use arrow keys to navigate. Choose your preferred left/right key behavior."
  },
  "自动显示 API 翻译悬浮窗": {
    "zh-TW": "自動顯示 API 翻譯懸浮窗",
    "ja": "API翻訳ポップアップを自動表示",
    "en": "Auto-show API translation tooltip"
  },
  "效果演示": {
    "zh-TW": "效果展示",
    "ja": "デモ",
    "en": "Preview"
  },
  "↑↓ 切换上下句 · ESC 退出聚焦 · 再按一次 →/← 关闭翻译框": {
    "zh-TW": "↑↓ 切換上下句 · ESC 退出聚焦 · 再按一次 →/← 關閉翻譯框",
    "ja": "↑↓ 前後の文に切り替え · ESC フォーカス解除 · もう一度 →/← で翻訳枠を閉じる",
    "en": "↑↓ Switch sentence · ESC Exit focus · Press →/← again to close translation box"
  },
  "聚焦此句": {
    "zh-TW": "聚焦此句",
    "ja": "この文にフォーカス",
    "en": "Focus this sentence"
  },
  "翻译": {
    "zh-TW": "翻譯",
    "ja": "翻訳",
    "en": "Translation"
  },
  "在线": {
    "zh-TW": "在線",
    "ja": "オンライン",
    "en": "Online"
  },
  "字幕": {
    "zh-TW": "字幕",
    "ja": "字幕",
    "en": "Subtitles"
  },
  "B站双语精读": {
    "zh-TW": "B站雙語精讀",
    "ja": "Bilibili バイリンガル精読",
    "en": "Bilibili Bilingual Study"
  },
  "启用 B 站双语精读学习助手": {
    "zh-TW": "啟用 B 站雙語精讀學習助手",
    "ja": "Bilibili 精読アシスタントを有効にする",
    "en": "Enable Bilibili Bilingual Study Assistant"
  },
  "在 B 站视频中挂载 RTTR 学习面板、自定义双语字幕和 HUD 讲义": {
    "zh-TW": "在 B 站影片中掛載 RTTR 學習面板、自訂雙語字幕和 HUD 講義",
    "ja": "Bilibiliの動画にRTTR学習パネル、バイリンガル字幕、HUD講義カードを導入します",
    "en": "Mount RTTR sidebar, custom bilingual subtitles and HUD widget on Bilibili videos."
  },
  "字幕与视频交互行为": {
    "zh-TW": "字幕與影片互動行為",
    "ja": "字幕と動画のインタラクション",
    "en": "Subtitle & Video Interaction Settings"
  },
  "自动暂停视频": {
    "zh-TW": "自動暫停影片",
    "ja": "動画の自動一時停止",
    "en": "Auto-Pause Video"
  },
  "在播放过程中遇到重点生词或讲义卡片时自动暂停视频 (推荐，方便记录笔记)": {
    "zh-TW": "在播放過程中遇到重點生詞或講義卡片時自動暫停影片 (推薦，方便記錄筆記)",
    "ja": "動画再生中に重要な単語や講義カードが出現した際に動画を自動一時停止します (推奨)",
    "en": "Automatically pause the video when encountering key study notes (Recommended)."
  },
  "自定义互动双语字幕": {
    "zh-TW": "自訂互動雙語字幕",
    "ja": "インタラクティブなバイリンガル字幕",
    "en": "Interactive Bilingual Subtitles"
  },
  "强力遮蔽 B 站原生低清字幕，渲染可完美进行单词悬停、音标查词和 AI 翻译的交互式双语字幕": {
    "zh-TW": "強力遮蔽 B 站原生低清字幕，渲染可完美進行單詞懸停、音標查詞和 AI 翻譯的互動式雙語字幕",
    "ja": "Bilibili標準の低画質字幕を完全に隠し、単語ホバー、発音記号、AI翻訳が可能なインタラクティブ字幕を表示します",
    "en": "Hide native subtitles and render professional interactive subtitles supporting word hover and translation."
  },
  "精读讲义 HUD 卡片": {
    "zh-TW": "精讀講義 HUD 卡片",
    "ja": "精読レクチャーHUDカード",
    "en": "Study Notes HUD Widget"
  },
  "默认在播放器中以半透明磨砂玻璃卡片呈现当前句子的重点讲义和释义": {
    "zh-TW": "預設在播放器中以半透明磨砂玻璃卡片呈現當前句子的重點講義和釋義",
    "ja": "プレーヤー上に半透明のグラスモーフィズムカードで現在の文のレクチャー内容を表示します",
    "en": "Show a beautiful semi-transparent glassmorphism card presenting key lecture notes."
  },
  "悬停字幕自动暂停": {
    "zh-TW": "懸停字幕自動暫停",
    "ja": "字幕ホバーで自動一時停止",
    "en": "Hover Subtitle to Pause"
  },
  "鼠标移到 B 站原生字幕上时自动暂停视频，移开后自动继续播放，方便您点击字幕单词查词发音": {
    "zh-TW": "滑鼠移到 B 站原生字幕上時自動暫停影片，移開後自動繼續播放，方便您點擊字幕單詞查詞發音",
    "ja": "Bilibiliのネイティブ字幕にマウスを乗せると動画が自動一時停止し、離れると再開します。字幕の単語をクリックして発音確認できます",
    "en": "Auto-pause video when mouse hovers over native subtitles, resume when mouse leaves. Allows clicking subtitle words for pronunciation."
  },
  "关闭": {
    "zh-TW": "關閉",
    "ja": "オフ",
    "en": "Off"
  },
  "悬停暂停": {
    "zh-TW": "懸停暫停",
    "ja": "ホバーで停止",
    "en": "Hover Pause"
  },
  "点击暂停": {
    "zh-TW": "點擊暫停",
    "ja": "クリックで停止",
    "en": "Click Pause"
  },
  "字幕与视频联动演示": {
    "zh-TW": "字幕與影片聯動演示",
    "ja": "字幕と動画のデモ",
    "en": "Subtitles & Video Preview"
  },
  "实时高精度同步 · 单词悬停查词 · 一键 A-B 单句循环": {
    "zh-TW": "即時高精度同步 · 單詞懸停查詞 · 一鍵 A-B 單句循環",
    "ja": "リアルタイム同期 · 単語ホバー検索 · A-Bループ機能",
    "en": "Realtime Sync · Word Hover Lookup · One-click A-B Sentence Loop"
  },
  "原生字幕智能交互": {
    "zh-TW": "原生字幕智慧互動",
    "ja": "ネイティブ字幕スマート操作",
    "en": "Native Subtitle Smart Interaction"
  },
  "悬停暂停 · 点击查词 · 单词高亮 · 移开继续": {
    "zh-TW": "懸停暫停 · 點擊查詞 · 單詞高亮 · 移開繼續",
    "ja": "ホバー一時停止 · クリック検索 · 単語ハイライト · 離れて再開",
    "en": "Hover Pause · Click Lookup · Word Highlight · Leave to Resume"
  },
  "聚焦样式": {
    "zh-TW": "聚焦樣式",
    "ja": "フォーカススタイル",
    "en": "Focus Style"
  },
  "弱化非聚焦文本 (默认)": {
    "zh-TW": "弱化非聚焦文本 (預設)",
    "ja": "非フォーカス文章を弱化 (デフォルト)",
    "en": "Dim surrounding text (Default)"
  },
  "高亮背景 (黄色)": {
    "zh-TW": "高亮背景 (黃色)",
    "ja": "背景ハイライト (黄色)",
    "en": "Highlight background (Yellow)"
  },
  "高亮背景 (蓝色)": {
    "zh-TW": "高亮背景 (藍色)",
    "ja": "背景ハイライト (青色)",
    "en": "Highlight background (Blue)"
  },
  "字体颜色 (蓝色)": {
    "zh-TW": "字體顏色 (藍色)",
    "ja": "文字色 (青色)",
    "en": "Text color (Blue)"
  },
  "字体颜色 (绿色)": {
    "zh-TW": "字體顏色 (綠色)",
    "ja": "文字色 (緑色)",
    "en": "Text color (Green)"
  },
  "下划线": {
    "zh-TW": "下劃線",
    "ja": "下線",
    "en": "Underline"
  }
};

function t(key: string) {
  const lang = settings.value?.targetLanguage || 'zh-CN';
  if (lang === 'zh-CN') return key;
  return uiDict[key]?.[lang] || key;
}

const activeTab = ref<'translation' | 'subtitles'>('translation');

const settings = ref<RTTRSettings>({
  apiKey: '',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',

  enabled: true,
  ttsLanguage: 'en-US',
  ttsRate: 0.85,
  ttsVolume: 1.0,
  ttsVoiceURI: '',
  enableAutoPronounce: true,
  enableClickPronounce: false,
  enableShortcutPronounce: true,
  enableSingleClickPronounce: true,
  translationEngine: 'google',
  translationPosition: 'bottom',
  showTranslationEngine: true,
  showSingleClickIPA: true,
  enableAutoTranslate: true,
  enableClickTranslate: false,
  enableLongPressTranslate: true,
  enableContextualCollocation: true,
  paragraphShortcut: '',
  targetLanguage: 'zh-CN',
  enableNumberConversion: true,
  enableContextMenu: true,
  enableSearchX: true,
  enableSearchReddit: false,
  enableSearchGoogle: true,
  customSearchEngines: [],
  enableContextMenuInfo: true,
  enableInlineSyllableRuby: true,
  syllableDisplayMode: 'badge',
  autoTranslateFocus: false,
  sentenceFocusStyle: 'dim',
  enableInlineParagraphTranslate: true,
  inlineParagraphTrigger: 'shift',
  inlineParagraphCustomShortcut: 'Alt+KeyP',

  enableBiliStudy: true,
  biliAutoPause: false,
  biliCustomSubtitles: true,
  biliHudVisible: true,
  biliSubtitleHoverPause: 'hover' as 'off' | 'hover' | 'click'
});

const voices = ref<SpeechSynthesisVoice[]>([]);
const saved = ref(false);
const showApiKey = ref(false);
const testing = ref(false);
const testResult = ref<string>('');
const testingTTS = ref(false);
const testResultTTS = ref<string>('');
const paragraphCommandShortcut = ref('');
const toggleCommandShortcut = ref('');
const commandShortcutTokens = computed(() => parseCommandShortcut(paragraphCommandShortcut.value));
const commandShortcutModifiers = computed(() => commandShortcutTokens.value.filter(token => token.kind === 'modifier'));
const commandShortcutKeys = computed(() => commandShortcutTokens.value.filter(token => token.kind === 'key'));

// --- Simulated DOM Animation State ---
const demoState = ref({ step: 0 });
let demoTimer: ReturnType<typeof setInterval> | null = null;

const runDemoLoop = () => {
  demoState.value.step = 0;
  setTimeout(() => { demoState.value.step = 1; }, 500);   // cursor enters
  setTimeout(() => { demoState.value.step = 2; }, 1500);  // right click
  setTimeout(() => { demoState.value.step = 3; }, 1800);  // menu appears
  setTimeout(() => { demoState.value.step = 4; }, 2800);  // menu click
  setTimeout(() => { demoState.value.step = 5; }, 3200);  // focus active (sentence 1)
  setTimeout(() => { demoState.value.step = 6; }, 4500);  // down press (sentence 2)
  setTimeout(() => { demoState.value.step = 7; }, 4700);  // down release
  setTimeout(() => { demoState.value.step = 8; }, 6000);  // down press (sentence 3)
  setTimeout(() => { demoState.value.step = 9; }, 6200);  // down release
  setTimeout(() => { demoState.value.step = 10; }, 7500); // down press (sentence 4)
  setTimeout(() => { demoState.value.step = 11; }, 7700); // down release
  setTimeout(() => { demoState.value.step = 12; }, 9500); // hold, then reset
};

const getDemoSpanStyle = (index: number) => {
  const step = demoState.value.step;
  if (step < 5) return { color: '#333' };

  let isActive = false;
  if (index === 0 && step >= 5 && step < 6) isActive = true;
  else if (index === 1 && step >= 6 && step < 8) isActive = true;
  else if (index === 2 && step >= 8 && step < 10) isActive = true;
  else if (index === 3 && step >= 10) isActive = true;

  const styleMode = settings.value.sentenceFocusStyle || 'dim';

  if (styleMode === 'dim') {
    return {
      color: isActive ? '#111' : '#bbb',
      transition: 'all 0.3s'
    };
  }

  const baseStyle: Record<string, any> = {
    color: '#333',
    transition: 'all 0.3s',
    padding: '2px 4px',
    borderRadius: '4px'
  };

  if (!isActive) {
    return {
      color: '#333',
      transition: 'all 0.3s'
    };
  }

  if (styleMode === 'hl-yellow') {
    baseStyle.backgroundColor = 'rgba(253, 224, 71, 0.4)';
    baseStyle.color = '#333';
  } else if (styleMode === 'hl-blue') {
    baseStyle.backgroundColor = 'rgba(59, 130, 246, 0.25)';
    baseStyle.color = '#333';
  } else if (styleMode === 'hl-red') {
    baseStyle.backgroundColor = 'rgba(239, 68, 68, 0.25)';
    baseStyle.color = '#333';
  }

  return baseStyle;
};

const getDemoPopupStyle = () => {
  const step = demoState.value.step;
  let top = '60px';
  let left = '28px';

  if (step >= 5 && step < 6) { top = '65px'; left = '28px'; } 
  else if (step >= 6 && step < 8) { top = '65px'; left = '260px'; } 
  else if (step >= 8 && step < 10) { top = '95px'; left = '28px'; } 
  else if (step >= 10) { top = '95px'; left = '210px'; }

  return {
    top,
    left,
    position: 'absolute',
    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
  };
};

const loadVoices = () => {
  const synth = window.speechSynthesis;
  voices.value = synth.getVoices().filter(v => v.lang.toLowerCase().includes('en'));
  if (voices.value.length === 0) voices.value = synth.getVoices();
  if (!settings.value.ttsVoiceURI && voices.value.length > 0) {
    // 优先选择本地的高质量系统默认声音 (localService: true)，避免在线声音(如 Google US English) 因网络被墙导致卡死
    const defaultLocalVoice = voices.value.find(v => v.default && v.localService) || 
                              voices.value.find(v => v.localService && v.lang.startsWith('en')) || 
                              voices.value.find(v => v.name.includes('Google US English')) ||
                              voices.value[0];
    settings.value.ttsVoiceURI = defaultLocalVoice?.voiceURI || '';
  }
};

const activeSectionId = ref('');

const currentSections = computed(() => {
  if (activeTab.value === 'translation') {
    return [
      { id: 'section-api', title: t('翻译 API 设置') },
      { id: 'section-translate-mode', title: t('划词翻译模式') },
      { id: 'section-pronounce-mode', title: t('划词发音模式') },
      { id: 'section-shortcuts', title: t('全局快捷键与段落翻译') },
      { id: 'section-sentence-focus', title: t('句子聚焦导航模式') },
      { id: 'section-tts', title: t('语音合成 (TTS) 设置') },
      { id: 'section-context-menu', title: t('右键自定义菜单') },
      { id: 'section-other', title: t('其他辅助功能') }
    ];
  } else {
    const list = [{ id: 'section-bili-study', title: t('B站双语精读') }];
    if (settings.value.enableBiliStudy) {
      list.push(
        { id: 'section-subtitle-behavior', title: t('字幕与视频交互行为') },
        { id: 'section-native-subtitle', title: t('原生字幕智能交互') },
        { id: 'section-subtitle-demo', title: t('字幕与视频联动演示') }
      );
    }
    return list;
  }
});

const scrollToSection = (id: string) => {
  activeSectionId.value = id;
  const el = document.getElementById(id);
  if (el) {
    const yOffset = -90; 
    const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
};

let observer: IntersectionObserver | null = null;

const initObserver = () => {
  if (observer) {
    observer.disconnect();
  }

  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        activeSectionId.value = entry.target.id;
      }
    });
  }, {
    rootMargin: '-100px 0px -60% 0px'
  });

  currentSections.value.forEach(section => {
    const el = document.getElementById(section.id);
    if (el) {
      observer?.observe(el);
    }
  });
};

watch(currentSections, () => {
  nextTick(() => {
    initObserver();
  });
}, { immediate: true });

onUnmounted(() => {
  if (observer) observer.disconnect();
});

onMounted(async () => {
  const savedSettings = await settingsStorage.getValue();
  settings.value = { ...settings.value, ...savedSettings };
  if (!Array.isArray(settings.value.customSearchEngines)) settings.value.customSearchEngines = [];
  await loadCommandShortcuts();
  
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  window.addEventListener('focus', handleCommandShortcutRefresh);
  document.addEventListener('visibilitychange', handleCommandShortcutRefresh);

  runDemoLoop();
  demoTimer = setInterval(runDemoLoop, 10000);
});

onBeforeUnmount(() => {
  if (demoTimer) clearInterval(demoTimer);
  window.removeEventListener('focus', handleCommandShortcutRefresh);
  document.removeEventListener('visibilitychange', handleCommandShortcutRefresh);
});

watch(() => settings.value.translationEngine, (newVal, oldVal) => {
  if (oldVal === 'none' && newVal !== 'none') {
    settings.value.translationPosition = 'bottom';
  }
  saveSettings();
});

async function saveSettings() {
  await settingsStorage.setValue(settings.value);
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}

const isRecordingShortcut = ref(false);

function startRecordingShortcut() {
  isRecordingShortcut.value = true;
  const handler = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Ignore standalone modifier keys
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(e.code);
    settings.value.inlineParagraphCustomShortcut = parts.join('+');
    isRecordingShortcut.value = false;
    document.removeEventListener('keydown', handler, true);
  };
  document.addEventListener('keydown', handler, true);
  // Auto-cancel after 5s
  setTimeout(() => {
    if (isRecordingShortcut.value) {
      isRecordingShortcut.value = false;
      document.removeEventListener('keydown', handler, true);
    }
  }, 5000);
}

function formatShortcutDisplay(shortcut: string): string {
  if (!shortcut) return '';
  return shortcut.split('+').map(part => {
    if (part === 'Ctrl') return '⌃ Ctrl';
    if (part === 'Alt') return '⌥ Alt';
    if (part === 'Shift') return '⇧ Shift';
    // Convert KeyX → X, Digit1 → 1, etc.
    if (part.startsWith('Key')) return part.slice(3);
    if (part.startsWith('Digit')) return part.slice(5);
    return part;
  }).join(' + ');
}

function testTTS() {
  testingTTS.value = true;
  testResultTTS.value = '';
  
  speakText("Testing pronunciation. The quick brown fox jumps over the lazy dog.", settings.value, (success, errorMsg) => {
    testingTTS.value = false;
    if (success) {
      testResultTTS.value = '✅ ' + t('测试成功');
      setTimeout(() => { testResultTTS.value = ''; }, 3000);
    } else {
      testResultTTS.value = '❌ ' + (errorMsg || t('测试失败'));
    }
  });
}

function openChromeShortcuts() {
  browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

async function loadCommandShortcuts() {
  const commands = await browser.commands.getAll();
  const paragraphCommand = commands.find(command => command.name === 'translate-paragraph');
  paragraphCommandShortcut.value = paragraphCommand?.shortcut || '';
  const toggleCommand = commands.find(command => command.name === '_execute_action');
  toggleCommandShortcut.value = toggleCommand?.shortcut || '';
}

function formatCommandShortcut(shortcut: string): string {
  if (!shortcut) return '未设置';
  return shortcut
    .replace(/\bAlt\b/g, 'Option(⌥)')
    .replace(/\bCommand\b/g, 'Command(⌘)')
    .replace(/\bCtrl\b/g, 'Ctrl(⌃)')
    .replace(/\bMacCtrl\b/g, 'Control(⌃)')
    .replace(/\bShift\b/g, 'Shift(⇧)');
}

type CommandShortcutToken = {
  label: string;
  kind: 'modifier' | 'key';
};

function parseCommandShortcut(shortcut: string): CommandShortcutToken[] {
  if (!shortcut) return [];
  const parts = shortcut.includes('+')
    ? shortcut.split('+')
    : shortcut.match(/Command|MacCtrl|Ctrl|Alt|Shift|[⌘⌃⌥⇧]|[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Enter|Tab|Arrow(?:Up|Down|Left|Right)/g) || [shortcut];

  return parts.map((part) => {
    if (part === 'Alt') return { label: '⌥', kind: 'modifier' };
    if (part === 'Command') return { label: '⌘', kind: 'modifier' };
    if (part === 'Ctrl' || part === 'MacCtrl') return { label: '⌃', kind: 'modifier' };
    if (part === 'Shift') return { label: '⇧', kind: 'modifier' };
    if (part === '⌥' || part === '⌘' || part === '⌃' || part === '⇧') return { label: part, kind: 'modifier' };
    return { label: part, kind: 'key' };
  });
}

async function handleCommandShortcutRefresh() {
  if (document.visibilityState === 'visible') {
    await loadCommandShortcuts();
  }
}

async function testTranslation() {
  testing.value = true;
  testResult.value = '';

  try {
    await settingsStorage.setValue(settings.value);
    const response = await browser.runtime.sendMessage({
      type: 'TRANSLATE',
      text: 'The scientist addressed the fundamental hypothesis.',
    });

    if (response.success && response.results) {
      testResult.value = `✅ ${t('API 连接成功！')}`;
    } else {
      testResult.value = `❌ ${response.error || t('未知错误')}`;
    }
  } catch (err: unknown) {
    testResult.value = `❌ ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    testing.value = false;
  }
}

watch(settings, () => {
  saveSettings();
}, { deep: true });
</script>

<template>
  <div class="options-container">
    <header class="header">
      <div class="logo">
        <img class="logo-icon" src="/icon.svg" alt="RTTR Logo" />
        <span class="logo-text">{{ t('RTTR 高级设置') }}</span>
      </div>

      <!-- Glassmorphic Tabs Bar -->
      <div class="tabs-nav-bar">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'translation' }" 
          @click="activeTab = 'translation'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></svg>
          {{ t('翻译') }}
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'subtitles' }" 
          @click="activeTab = 'subtitles'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><rect x="2" y="4" width="20" height="16" rx="4" /><path d="M7 10h4" /><path d="M7 14h10" /></svg>
          {{ t('字幕') }}
        </button>
      </div>

      <div class="header-actions">
        <label class="label">{{ t('界面与目标语言') }}</label>
        <select v-model="settings.targetLanguage" class="select">
          <option value="zh-CN">{{ t("简体中文 (Simplified)") }}</option>
          <option value="zh-TW">{{ t("繁体中文 (Traditional)") }}</option>
          <option value="ja">{{ t("日本語 (Japanese)") }}</option>
          <option value="en">{{ t("English (English)") }}</option>
        </select>
      </div>
    </header>

    <div class="settings-layout">
      <!-- Sidebar Navigation Directory -->
      <aside class="settings-sidebar">
        <div class="sidebar-nav">
          <a 
            v-for="item in currentSections" 
            :key="item.id" 
            :href="'#' + item.id"
            class="sidebar-nav-item"
            :class="{ active: activeSectionId === item.id }"
            @click.prevent="scrollToSection(item.id)"
          >
            {{ item.title }}
          </a>
        </div>
      </aside>

      <main class="content">
        <!-- Translation tab content -->
        <template v-if="activeTab === 'translation'">
          <!-- API Settings -->
          <section id="section-api" class="settings-card">
          <h2>{{ t("翻译 API 设置") }}</h2>
          <p class="section-desc">{{ t("配置 OpenAI 兼容的接口信息用于长句/段落的 AI 划词翻译。") }}</p>

          <div class="form-group">
            <label class="label">{{ t("AI 长句翻译 API Key (OpenAI 格式)") }}</label>
            <div class="input-with-toggle">
              <input :type="showApiKey ? 'text' : 'password'" v-model="settings.apiKey" placeholder="sk-..." class="input" />
              <button class="eye-btn" @click="showApiKey = !showApiKey" aria-label="Toggle visibility">
                <svg v-if="showApiKey" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              </button>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group half" style="flex: 2;">
              <label class="label">{{ t("API 端点") }}</label>
              <input type="text" v-model="settings.apiEndpoint" class="input" placeholder="https://api.openai.com/v1/chat/completions" />
            </div>
            <div class="form-group half" style="flex: 1;">
              <label class="label">{{ t("模型") }}</label>
              <input type="text" v-model="settings.model" class="input" placeholder="gpt-4o-mini" />
            </div>
          </div>

          <div class="actions">
            <button class="test-btn" @click="testTranslation" :disabled="testing" :class="{ 'is-loading': testing }">
              <svg v-if="testing" class="spinner" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              {{ testing ? t('测试中...') : t('测试 API') }}
            </button>
            <span v-if="testResult" class="test-result-inline" :class="{ error: testResult.includes('❌') }">
              <svg v-if="testResult.includes('✅')" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              {{ testResult.replace(/❌|✅|⏳|正在/g, '').trim() }}
            </span>
          </div>
        </section>

        <!-- Translation Tooltip Preview -->
        <section class="settings-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h2 style="margin: 0;">{{ t("翻译悬浮窗与引擎") }}</h2>
            <div style="display: flex; align-items: center; gap: 12px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #555; cursor: pointer;" :style="{ opacity: settings.translationEngine === 'none' ? 0.5 : 1, pointerEvents: settings.translationEngine === 'none' ? 'none' : 'auto' }">
                <input type="checkbox" v-model="settings.showTranslationEngine" :disabled="settings.translationEngine === 'none'" />
                {{ t("显示引擎尾标") }}
              </label>
              <select v-model="settings.translationEngine" class="select" style="width: auto; padding: 6px 12px; font-size: 13px;">
                <option value="none">{{ t("不启用") }}</option>
                <option value="google">Google Translate</option>
                <option value="deepl">DeepL</option>
                <option value="bing">Bing Microsoft</option>
              </select>
            </div>
          </div>
          <p class="section-desc">{{ t("直角灰底设计。点击下方卡片选择翻译框的默认弹出位置。") }}</p>
          
          <div class="animation-previews" style="grid-template-columns: 1fr 1fr;">
            <!-- 位置 1：下方 -->
            <div class="preview-box" :class="{ active: settings.translationEngine !== 'none' && settings.translationPosition === 'bottom' }" @click="settings.translationEngine !== 'none' && (settings.translationPosition = 'bottom')">
              <div class="preview-title">{{ t("显示于文字下方") }}</div>
              <div class="anim-container anim-translation" style="height: 140px;">
                <div class="anim-text" style="padding-top: 40px;">
                  <span class="trans-target-word">
                    <span style="color: #007aff;">hypothesis</span>
                    <!-- 黑色音标悬浮窗 (模拟) -->
                    <div class="anim-badge-black trans-ipa-badge" :style="{ top: '-24px', opacity: settings.showSingleClickIPA ? '' : '0 !important', transition: 'opacity 0.2s ease' }">
                      / haɪˈpɒθəsɪs /
                    </div>
                    <div class="anim-translation-tooltip-bottom">
                      <strong>{{ t("假设") }}</strong><span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">{{ settings.translationEngine === 'google' ? 'Google' : settings.translationEngine === 'deepl' ? 'DeepL' : 'Bing' }}</span>
                    </div>
                    <div class="anim-click-ripple-trans"></div>
                    <svg class="anim-cursor-trans" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span>
                </div>
              </div>
            </div>

            <!-- 位置 2：上方 -->
            <div class="preview-box" :class="{ active: settings.translationEngine !== 'none' && settings.translationPosition === 'top' }" @click="settings.translationEngine !== 'none' && (settings.translationPosition = 'top')">
              <div class="preview-title">{{ t("显示于文字上方") }}</div>
              <div class="anim-container anim-translation" style="height: 140px;">
                <div class="anim-text" style="padding-top: 40px;">
                  <span class="trans-target-word">
                    <span style="color: #007aff;">hypothesis</span>
                    <!-- 黑色音标悬浮窗 (模拟) -->
                    <div class="anim-badge-black trans-ipa-badge" :style="{ top: '-24px', opacity: settings.showSingleClickIPA ? '' : '0 !important', transition: 'opacity 0.2s ease' }">
                      / haɪˈpɒθəsɪs /
                    </div>
                    <!-- 直角灰色翻译悬浮窗避让到上方 -->
                    <div class="anim-translation-tooltip-top" :style="{ top: settings.showSingleClickIPA ? '-68px' : '-34px', transition: 'top 0.2s ease' }">
                      <strong>{{ t("假设") }}</strong><span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">{{ settings.translationEngine === 'google' ? 'Google' : settings.translationEngine === 'deepl' ? 'DeepL' : 'Bing' }}</span>
                    </div>
                    <div class="anim-click-ripple-trans"></div>
                    <svg class="anim-cursor-trans" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span>
                </div>
              </div>
            </div>

            <!-- 位置 3：音标悬浮窗内 -->
            <div class="preview-box" style="grid-column: 1 / -1; max-width: 50%; margin: 0 auto; width: 100%;" :class="{ active: settings.translationEngine !== 'none' && settings.translationPosition === 'pronounce-badge' }" @click="settings.translationEngine !== 'none' && (settings.translationPosition = 'pronounce-badge')">
              <div class="preview-title">{{ t("显示在音标悬浮窗内") }}</div>
              <div class="anim-container anim-translation" style="height: 140px;">
                <div class="anim-text" style="padding-top: 40px;">
                  <span class="trans-target-word">
                    <span style="color: #007aff;">hypothesis</span>
                    <!-- 黑色音标悬浮窗带翻译 -->
                    <div class="anim-badge-black trans-ipa-badge" style="top: -46px; opacity: 1;">
                      <div style="padding-bottom: 3px;">/ haɪˈpɒθəsɪs /</div>
                      <div style="border-top: 1px solid rgba(255,255,255,0.15); padding-top: 3px; font-weight: 400; color: #fff; text-align: center;">
                        {{ t("假设") }}
                      </div>
                    </div>
                    <div class="anim-click-ripple-trans"></div>
                    <svg class="anim-cursor-trans" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Selection Translation Mode -->
        <section id="section-translate-mode" class="settings-card">
          <h2>{{ t("划词翻译模式") }}</h2>
          <p class="section-desc">{{ t("配置拖动选中文本时的翻译行为。翻译悬浮窗与发音相互独立，可同时启用。") }}</p>

          <div class="animation-previews" style="grid-template-columns: 1fr 1fr;">
            <!-- {{ t("选中自动翻译") }} -->
            <div class="preview-box" :class="{ active: settings.enableAutoTranslate && settings.translationEngine !== 'none' }" @click="settings.translationEngine !== 'none' && (settings.enableAutoTranslate = !settings.enableAutoTranslate)">
              <div class="preview-title">{{ t("选中自动翻译") }}</div>
              <div class="anim-container anim-sel-trans-auto" style="height: 120px;">
                <div class="anim-text">
                  He was
                  <span class="anim-selection sel-trans-sel">
                    locking eyes
                    <div class="anim-translation-tooltip-bottom sel-trans-tooltip-auto">
                      <strong>{{ t("锁定目光") }}</strong><span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">{{ settings.translationEngine === 'google' ? 'Google' : settings.translationEngine === 'deepl' ? 'DeepL' : 'Bing' }}</span>
                    </div>
                    <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span>
                  with her.
                </div>
              </div>
            </div>

            <!-- {{ t("选中点击翻译") }} -->
            <div class="preview-box" :class="{ active: settings.enableClickTranslate && settings.translationEngine !== 'none' }" @click="settings.translationEngine !== 'none' && (settings.enableClickTranslate = !settings.enableClickTranslate)">
              <div class="preview-title">{{ t("选中点击翻译") }}</div>
              <div class="anim-container anim-sel-trans-click" style="height: 120px;">
                <div class="anim-text">
                  He was
                  <span class="anim-selection sel-trans-sel-click">
                    locking eyes
                    <div class="anim-translation-tooltip-bottom sel-trans-tooltip-click">
                      <strong>{{ t("锁定目光") }}</strong><span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">{{ settings.translationEngine === 'google' ? 'Google' : settings.translationEngine === 'deepl' ? 'DeepL' : 'Bing' }}</span>
                    </div>
                    <div class="anim-click-ripple sel-trans-ripple"></div>
                    <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span>
                  with her.
                </div>
              </div>
            </div>
          </div>

          <div class="animation-previews" style="grid-template-columns: 1fr; margin-top: 16px;">
            <!-- 选中长按翻译 -->
            <div class="preview-box" :class="{ active: settings.enableLongPressTranslate && settings.translationEngine !== 'none' }" @click="settings.translationEngine !== 'none' && (settings.enableLongPressTranslate = !settings.enableLongPressTranslate)">
              <div class="preview-title" style="display: flex; justify-content: space-between; align-items: center;">
                <span>{{ t("长按 AI 翻译") }}</span>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #666; cursor: pointer; z-index: 10;" @click.stop>
                  <input type="checkbox" v-model="settings.enableContextualCollocation" style="margin: 0; width: 12px; height: 12px;" />
                  {{ t("语境搭配分析") }}
                </label>
              </div>
              <div class="anim-container anim-sel-trans-longpress" style="height: 120px;">
                <div class="anim-text">
                  He was
                  <span class="anim-selection sel-trans-sel-longpress">
                    locking eyes
                    <div class="anim-translation-tooltip-bottom sel-trans-tooltip-longpress" style="display: flex; align-items: center; gap: 8px;">
                      <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span class="trans-en" style="font-size: 11px; line-height: 1.4;">locked eyes</span>
                        <span class="trans-zh" style="font-size: 12px; line-height: 1.4;">{{ t("(锁定目光)") }}</span>
                      </div>
                      <span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">AI</span>
                    </div>
                    <div class="anim-longpress-ring-container">
                      <svg class="anim-longpress-ring" viewBox="0 0 32 32">
                        <circle class="ring-progress" cx="16" cy="16" r="14"></circle>
                      </svg>
                    </div>
                    <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span>
                  with her.
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Selection Pronunciation Settings -->
        <section id="section-pronounce-mode" class="settings-card">
          <h2>{{ t("划词发音模式") }}</h2>
          <p class="section-desc">{{ t("配置拖动选中文本时的发音行为。直接点击下方卡片即可切换模式。") }}</p>

          <div class="animation-previews">
            <!-- Single Click Mode Preview -->
            <div class="preview-box" :class="{ active: settings.enableSingleClickPronounce }" @click="settings.enableSingleClickPronounce = !settings.enableSingleClickPronounce">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 12px; margin-bottom: 8px;">
                <div class="preview-title" style="margin-bottom: 0;">{{ t("单击发音") }}</div>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #666; cursor: pointer; z-index: 10;" @click.stop>
                  <input type="checkbox" v-model="settings.showSingleClickIPA" style="margin: 0; width: 12px; height: 12px;" />
                  {{ t("显示音标悬浮窗") }}
                </label>
              </div>
              <div class="anim-container anim-single-click">
                <div class="anim-text">
                  He was 
                  <span class="anim-selection" style="background: transparent;">
                    locking
                    <div class="anim-badge-black" :style="{ opacity: settings.showSingleClickIPA ? '' : '0 !important' }">
                      / 'lɒkɪŋ /
                    </div>
                    <div class="anim-badge" :style="{ top: '-24px', marginLeft: settings.showSingleClickIPA ? '65px' : '0', transition: 'margin-left 0.2s ease' }">
                      <svg class="anim-speaker" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="wave1"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="wave2"></path></svg>
                    </div>
                    <div class="anim-click-ripple" style="left: 25px;"></div>
                    <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span> 
                  eyes with her.
                </div>
              </div>
            </div>

            <!-- Auto Mode Preview -->
            <div class="preview-box" :class="{ active: settings.enableAutoPronounce }" @click="settings.enableAutoPronounce = !settings.enableAutoPronounce">
              <div class="preview-title">{{ t("选中自动发音") }}</div>
              <div class="anim-container anim-auto">
                <div class="anim-text">
                  He was 
                  <span class="anim-selection">
                    locking eyes
                    <div class="anim-badge">
                      <svg class="anim-speaker" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="wave1"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="wave2"></path></svg>
                    </div>
                    <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span> 
                  with her.
                </div>
              </div>
            </div>

            <!-- Click Mode Preview -->
            <div class="preview-box" :class="{ active: settings.enableClickPronounce }" @click="settings.enableClickPronounce = !settings.enableClickPronounce">
              <div class="preview-title">{{ t("选中点击发音") }}</div>
              <div class="anim-container anim-click">
                <div class="anim-text">
                  He was 
                  <span class="anim-selection">
                    locking eyes
                    <div class="anim-badge">
                      <svg class="anim-speaker" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="wave1"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="wave2"></path></svg>
                    </div>
                    <div class="anim-click-ripple"></div>
                    <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span> 
                  with her.
                </div>
              </div>
            </div>

            <!-- Shortcut Mode Preview -->
            <div class="preview-box" :class="{ active: settings.enableShortcutPronounce }" @click="settings.enableShortcutPronounce = !settings.enableShortcutPronounce">
              <div class="preview-title">{{ t("快捷键发音") }}</div>
              <div class="anim-container anim-shortcut">
                <div class="anim-text">
                  He was 
                  <span class="anim-selection">
                    locking eyes
                    <div class="anim-badge">
                      <svg class="anim-speaker" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="wave1"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="wave2"></path></svg>
                    </div>
                    <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                  </span> 
                  with her.
                </div>
                <div class="anim-keyboard-key">R</div>
              </div>
            </div>
          </div>
        </section>

        <!-- Global Shortcuts Settings -->
        <section id="section-shortcuts" class="settings-card">
          <h2>{{ t("全局快捷键与段落翻译") }}</h2>
          <p class="section-desc">{{ t("配置段落翻译的触发快捷键。它能在不破坏原有英文版面的前提下，将中文翻译像拼音一样注入到生词上方。") }}</p>

          <div style="margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px;">{{ t("段落翻译") }}</div>
                <div style="font-size: 12px; color: #6b7280;">
                  {{ t('当前：') }} {{ formatCommandShortcut(paragraphCommandShortcut) }}
                </div>
              </div>
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px;">{{ t("开启/关闭 RTTR") }}</div>
                <div style="font-size: 12px; color: #6b7280;">
                  {{ t('当前：') }} {{ formatCommandShortcut(toggleCommandShortcut) }}
                </div>
              </div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                {{ t('请在 Chrome 的扩展快捷键页面设置。') }}
              </div>
            </div>
            <button
              @click="openChromeShortcuts"
              style="background: #fff; border: 1px solid #d1d5db; padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; min-width: 140px; text-align: center; font-weight: 500; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05); color: #374151;"
            >
              {{ t("打开快捷键页面") }}
            </button>
          </div>

          <div class="animation-previews" style="grid-template-columns: 1fr;">
            <div class="preview-box active">
              <div class="preview-title">{{ t("沉浸式 Ruby 注音效果演示") }}</div>
              <div class="anim-container anim-paragraph-trans" style="height: 220px; padding: 24px 32px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; background: #fafafa; gap: 16px;">
                <div class="anim-text" style="font-size: 15px; line-height: 1.8; color: #333; text-align: left; width: 100%;">
                  Before reading the text, make sure to check the context.
                </div>
                <div class="anim-text anim-paragraph-text" style="font-size: 15px; line-height: 1.8; color: #333; position: relative; text-align: left; width: 100%;">
                  This feature injects
                  <span class="anim-ruby-wrapper ruby-color-1">
                    <span class="anim-ruby-base">seamless</span>
                    <span class="anim-ruby-text">{{ t("无缝的") }}</span>
                  </span>
                  translations directly
                  <span class="anim-ruby-wrapper ruby-color-2">
                    <span class="anim-ruby-base">above</span>
                    <span class="anim-ruby-text">{{ t("上方") }}</span>
                  </span>
                  the English words.
                  <svg class="anim-paragraph-spinner" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
                </div>
                <div class="anim-text" style="font-size: 15px; line-height: 1.8; color: #333; text-align: left; width: 100%;">
                  It helps you read and learn efficiently without interruption.
                </div>
                <!-- Floating keyboard hint animation -->
                <div class="anim-floating-shortcut" v-if="paragraphCommandShortcut">
                  <span class="shortcut-group">
                    <span
                      class="key key-modifier"
                      v-for="token in commandShortcutModifiers"
                      :key="token.label"
                    >
                      {{ token.label }}
                    </span>
                  </span>
                  <span class="shortcut-plus" v-if="commandShortcutModifiers.length && commandShortcutKeys.length">+</span>
                  <span class="shortcut-group" v-if="commandShortcutKeys.length">
                    <span
                      class="key key-main"
                      v-for="token in commandShortcutKeys"
                      :key="token.label"
                    >
                      {{ token.label }}
                    </span>
                  </span>
                </div>
                <!-- Floating mouse cursor -->
                <svg class="anim-cursor anim-paragraph-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
              </div>
            </div>
          </div>

          <div class="animation-previews" style="grid-template-columns: 1fr; margin-top: 16px;">
            <div class="preview-box" :class="{ active: settings.enableInlineParagraphTranslate }" @click="settings.enableInlineParagraphTranslate = !settings.enableInlineParagraphTranslate">
              <div class="preview-title">{{ t("Shift 段落内联翻译演示") }}</div>
              <div class="anim-container anim-inline-para" style="height: 180px; padding: 24px 32px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; background: #fafafa; gap: 0; position: relative; overflow: hidden;">
                <div class="anim-inline-para-original" style="font-size: 14px; line-height: 1.8; color: #333; text-align: left; width: 100%;">
                  The programs in this language are called <em>scripts</em>. They can be written right in a web page's HTML.
                </div>
                <div class="anim-inline-para-translated">
                  这种语言编写的程序被称为脚本。它们可以直接编写在网页的 HTML 中。
                </div>
                <!-- Shift key hint -->
                <div class="anim-inline-shift-key">
                  <span class="key key-main">⇧ Shift</span>
                </div>
                <!-- Floating mouse cursor -->
                <svg class="anim-cursor anim-inline-para-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
              </div>
            </div>
          </div>

          <div v-if="settings.enableInlineParagraphTranslate" style="margin-top: 16px; padding: 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <span style="font-size: 13px; font-weight: 500; color: #374151;">{{ t("触发方式") }}</span>
              <select v-model="settings.inlineParagraphTrigger" style="flex: 1; max-width: 260px; padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; background: white; outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05); color: #111827;">
                <option value="shift">{{ t("+ Shift 翻译 / 还原该段") }}</option>
                <option value="ctrl">{{ t("+ Ctrl 翻译 / 还原该段") }}</option>
                <option value="alt">{{ t("+ ⌥ 翻译 / 还原该段") }}</option>
                <option value="longpress">{{ t("+ 长按鼠标左键") }}</option>
                <option value="direct">{{ t("直接翻译该段") }}</option>
                <option value="custom">{{ t("自定义快捷键") }}</option>
              </select>
            </div>
            <div v-if="settings.inlineParagraphTrigger === 'custom'" style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 12px; color: #6b7280;">{{ t("快捷键") }}</span>
              <div
                @click="startRecordingShortcut"
                tabindex="0"
                style="flex: 1; max-width: 220px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; text-align: center; cursor: pointer; user-select: none; transition: all 0.2s ease;"
                :style="isRecordingShortcut
                  ? 'border: 2px solid #3b82f6; background: #eff6ff; color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15);'
                  : 'border: 1px solid #d1d5db; background: white; color: #111827; box-shadow: 0 1px 2px rgba(0,0,0,0.05);'"
              >
                {{ isRecordingShortcut ? t('按下快捷键组合…') : formatShortcutDisplay(settings.inlineParagraphCustomShortcut) || t('点击设置') }}
              </div>
            </div>
            <div v-if="settings.inlineParagraphTrigger === 'direct'" style="margin-top: 8px;">
              <div style="font-size: 11px; color: #9ca3af;">{{ t("⚠ 直接模式会在鼠标悬停新段落时自动翻译，可能产生大量翻译请求。") }}</div>
            </div>
          </div>
        </section>


        <!-- Sentence Focus Navigation Mode -->
        <section id="section-sentence-focus" class="settings-card">
          <h2>{{ t("句子聚焦导航模式") }}</h2>
          <p class="section-desc">{{ t("右键段落选择「聚焦此句」后，使用方向键控制句子。选择你偏好的左右键行为。") }}</p>

          <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 20px;">
            <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" v-model="settings.autoTranslateFocus" class="checkbox">
              <span class="label-text" style="font-weight: 500; font-size: 14px; color: #374151;">{{ t("自动显示 API 翻译悬浮窗") }}</span>
            </label>

            <div style="display: flex; align-items: center; gap: 12px; padding-left: 22px;">
              <span style="font-size: 13px; color: #374151; font-weight: 500;">{{ t("聚焦样式") }}</span>
              <select v-model="settings.sentenceFocusStyle" style="max-width: 240px; padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; background: white; outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05); color: #111827;">
                <option value="dim">{{ t("弱化非聚焦文本 (默认)") }}</option>
                <option value="hl-yellow">{{ t("高亮背景 (黄色)") }}</option>
                <option value="hl-blue">{{ t("高亮背景 (蓝色)") }}</option>
                <option value="hl-red">{{ t("高亮背景 (红色)") }}</option>
              </select>
            </div>
          </div>

          <!-- Animated Demo (Vue State Driven) -->
          <div class="animation-previews" style="grid-template-columns: 1fr; margin-bottom: 20px;">
            <div class="preview-box active" style="cursor: default;">
              <div class="preview-title">{{ t("效果演示") }}</div>
              <div class="anim-container" style="height: 200px; padding: 20px 28px; flex-direction: column; align-items: flex-start; justify-content: center; background: #fafafa; overflow: hidden; position: relative;">
                
                <!-- Paragraph Text -->
                <div class="focus-demo-text" style="font-size: 14px; line-height: 2.0; color: #333; text-align: left; width: 100%; transition: all 0.3s;">
                  <span :style="getDemoSpanStyle(0)">The quick brown fox jumps over the lazy dog.</span><span class="demo-sep" :class="{ 'demo-sep-visible': demoState.step >= 5 }">&#9675;</span><span :style="getDemoSpanStyle(1)">It was a bright and sunny day.</span><span class="demo-sep" :class="{ 'demo-sep-visible': demoState.step >= 5 }">&#9675;</span><span :style="getDemoSpanStyle(2)">Birds were singing in the trees.</span><span class="demo-sep" :class="{ 'demo-sep-visible': demoState.step >= 5 }">&#9675;</span><span :style="getDemoSpanStyle(3)">A gentle breeze blew across the field.</span>
                </div>

                <!-- Context Menu -->
                <div class="demo-menu" :class="{ 'demo-menu-visible': demoState.step === 3 || demoState.step === 4 }">
                  <div class="demo-menu-item" :style="{ backgroundColor: demoState.step === 4 ? '#007aff' : 'transparent', color: demoState.step === 4 ? '#fff' : '#374151' }">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/></svg>
                    {{ t("聚焦此句") }}
                  </div>
                </div>

                <!-- Mock Translation Popup -->
                <div class="demo-trans-popup" :class="{ 'popup-visible': settings.autoTranslateFocus && demoState.step >= 5 }" :style="getDemoPopupStyle()">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; color: #6b7280; flex-shrink: 0;"><path d="M5 15l7-7 7 7"/></svg>
                  <span style="font-size: 13px; color: #374151; font-weight: 500;">{{ t("这是一段翻译结果的演示...") }}</span>
                </div>

                <!-- Ripple -->
                <div v-if="demoState.step === 2" class="demo-ripple"></div>
                <div v-if="demoState.step === 4" class="demo-ripple" style="left: calc(48% + 34px); top: calc(38% + 14px); border-color: rgba(0,0,0,0.4);"></div>

                <!-- Cursor -->
                <svg class="demo-cursor" :class="{ 
                  'cursor-start': demoState.step === 0,
                  'cursor-target': demoState.step >= 1 && demoState.step < 3,
                  'cursor-menu': demoState.step >= 3 && demoState.step <= 4,
                  'cursor-hide': demoState.step >= 5
                }" width="24" height="24" viewBox="0 0 24 24">
                  <path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
                </svg>

                <!-- Mouse Indicator -->
                <div class="demo-mouse-indicator" :class="{ 'mouse-hidden': demoState.step >= 5 }">
                  <svg width="24" height="36" viewBox="0 0 24 36" fill="none" stroke="#9ca3af" stroke-width="1.5">
                    <!-- Left Button -->
                    <path d="M 4 10 A 8 8 0 0 1 12 2 L 12 14 L 4 14 Z" :fill="demoState.step === 4 ? '#007aff' : 'transparent'" style="transition: fill 0.15s;" />
                    <!-- Right Button -->
                    <path d="M 12 2 A 8 8 0 0 1 20 10 L 20 14 L 12 14 Z" :fill="demoState.step === 2 ? '#007aff' : 'transparent'" style="transition: fill 0.15s;" />
                    <!-- Body -->
                    <path d="M 4 14 L 20 14 L 20 22 A 8 8 0 0 1 4 22 Z" />
                    <!-- Scroll Wheel -->
                    <line x1="12" y1="4" x2="12" y2="8" />
                  </svg>
                </div>

                <!-- Down Arrow Indicator -->
                <div class="demo-key-indicator" :class="{ 'key-visible': demoState.step >= 6, 'key-pressed': demoState.step === 6 || demoState.step === 8 || demoState.step === 10 }">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M19 12l-7 7-7-7"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Shortcut hints outside the animation card -->
          <div style="margin-bottom: 12px;">
            <div class="focus-keys-hint" style="justify-content: center; gap: 32px;">
              <div class="focus-key-group">
                <span class="focus-key">R</span>
                <span class="focus-key-label" style="font-weight: 500;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  TTS
                </span>
              </div>
              <div class="focus-key-group">
                <span class="focus-key">&#8592;</span>
                <span class="focus-key-label" style="font-weight: 500;">API {{ t("翻译") }}</span>
              </div>
              <div class="focus-key-group">
                <span class="focus-key">&#8594;</span>
                <span class="focus-key-label" style="font-weight: 500;">AI {{ t("翻译") }}</span>
              </div>
            </div>
          </div>

          <p style="font-size: 11px; color: #9ca3af; margin-top: 12px; text-align: center;">{{ t("↑↓ 切换上下句 · ESC 退出聚焦 · 再按一次 →/← 关闭翻译框") }}</p>
        </section>

        <!-- TTS Settings -->
        <section id="section-tts" class="settings-card">
          <h2>{{ t("语音合成 (TTS) 设置") }}</h2>
          <p class="section-desc">{{ t("配置发音人的语言、语速及音量。") }}</p>
          
          <div class="form-row">
            <div class="form-group half">
              <label class="label">{{ t("发音人 (Voice)") }}</label>
              <select v-model="settings.ttsVoiceURI" class="select">
                <option v-for="voice in voices" :key="voice.voiceURI" :value="voice.voiceURI">
                  {{ voice.name }} ({{ voice.lang }}) {{ voice.localService ? '' : ' - ' + t('在线') }}
                </option>
              </select>
            </div>
            <div class="form-group half">
              <label class="label">{{ t("语言 (Language)") }}</label>
              <input type="text" v-model="settings.ttsLanguage" class="input" placeholder="en-US" />
            </div>
          </div>

          <div class="form-group">
            <label class="label">{{ t("语速 (Rate):") }} {{ (settings.ttsRate ?? 0.85).toFixed(2) }}x</label>
            <input type="range" v-model.number="settings.ttsRate" min="0.1" max="2.0" step="0.05" class="slider" />
          </div>

          <div class="form-group">
            <label class="label">{{ t("音量 (Volume):") }} {{ Math.round((settings.ttsVolume ?? 1.0) * 100) }}%</label>
            <input type="range" v-model.number="settings.ttsVolume" min="0" max="1" step="0.05" class="slider" />
          </div>

          <div class="actions">
            <button class="test-btn" @click="testTTS" :disabled="testingTTS" :class="{ 'is-loading': testingTTS }">
              <svg v-if="testingTTS" class="playing-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path class="wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path class="wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              {{ testingTTS ? t('播放中...') : t('测试发音') }}
            </button>
            <span v-if="testResultTTS" class="test-result-inline" :class="{ error: testResultTTS.includes('❌') }">
              <svg v-if="testResultTTS.includes('✅')" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <svg v-else-if="testResultTTS.includes('❌')" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              {{ testResultTTS.replace(/❌|✅/g, '').trim() }}
            </span>
            <span class="save-status" :class="{ visible: saved }">{{ t("✓ 已自动保存") }}</span>
          </div>
        </section>

        <!-- Context Menu Settings -->
        <section id="section-context-menu" class="settings-card">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2 style="margin: 0;">{{ t("右键自定义菜单") }}</h2>
            <label class="switch-container" style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" v-model="settings.enableContextMenu" class="switch-input" />
              <span class="switch-slider"></span>
            </label>
          </div>
          <p class="section-desc" style="margin-top: 8px;">{{ t("自定义右键菜单中的搜索快捷按钮。") }}</p>

          <div v-if="settings.enableContextMenu" style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
            <div style="padding: 12px 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" v-model="settings.enableContextMenuInfo" style="margin: 0; width: 14px; height: 14px; cursor: pointer;" />
              <div>
                <div style="font-size: 13px; font-weight: 500; color: #111827;">{{ t("发音后显示音标与翻译") }}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">{{ t("点击菜单栏发音按钮后，自动显示音标、机器翻译和 AI 语境翻译。适用于链接文本等点击会跳转的场景") }}</div>
              </div>
            </div>

            <div style="border-top: 1px solid #e5e7eb; margin: 4px 0;"></div>

            <div style="padding: 12px 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" v-model="settings.enableSearchGoogle" style="margin: 0; width: 14px; height: 14px; cursor: pointer;" />
              <div>
                <div style="font-size: 13px; font-weight: 500; color: #111827;">{{ t("Google 搜索") }}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">{{ t("在自定义右键菜单中显示 Google 搜索按钮") }}</div>
              </div>
            </div>

            <div style="padding: 12px 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" v-model="settings.enableSearchX" style="margin: 0; width: 14px; height: 14px; cursor: pointer;" />
              <div>
                <div style="font-size: 13px; font-weight: 500; color: #111827;">{{ t("X (Twitter) 搜索") }}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">{{ t("在自定义右键菜单中显示 X (Twitter) 精准搜索按钮") }}</div>
              </div>
            </div>

            <div style="padding: 12px 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" v-model="settings.enableSearchReddit" style="margin: 0; width: 14px; height: 14px; cursor: pointer;" />
              <div>
                <div style="font-size: 13px; font-weight: 500; color: #111827;">{{ t("Reddit 搜索") }}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">{{ t("在自定义右键菜单中显示 Reddit 搜索按钮") }}</div>
              </div>
            </div>

            <!-- Custom Search Engines -->
            <div style="padding: 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb;">
              <div style="font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 4px;">{{ t("自定义搜索引擎") }}</div>
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 12px;">{{ t("使用 {query} 作为搜索词占位符") }}</div>

              <div v-for="(engine, idx) in settings.customSearchEngines" :key="idx" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <input type="checkbox" v-model="engine.enabled" style="margin: 0; width: 14px; height: 14px; cursor: pointer; flex-shrink: 0;" />
                <input type="text" v-model="engine.name" :placeholder="t('名称')" style="width: 80px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; outline: none; background: white; color: #111827;" />
                <input type="text" v-model="engine.urlTemplate" :placeholder="'https://example.com/search?q={query}'" style="flex: 1; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; outline: none; background: white; color: #111827; font-family: ui-monospace, monospace;" />
                <button @click="settings.customSearchEngines.splice(idx, 1)" style="flex-shrink: 0; width: 24px; height: 24px; border: none; background: transparent; cursor: pointer; color: #9ca3af; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.15s;" @mouseenter="$event.target.style.color='#ef4444';$event.target.style.background='#fef2f2'" @mouseleave="$event.target.style.color='#9ca3af';$event.target.style.background='transparent'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <button @click="settings.customSearchEngines.push({ name: '', urlTemplate: '', enabled: true })" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px dashed #d1d5db; border-radius: 8px; background: white; cursor: pointer; font-size: 12px; color: #6b7280; transition: all 0.15s; width: 100%; justify-content: center;" @mouseenter="$event.target.style.borderColor='#3b82f6';$event.target.style.color='#3b82f6'" @mouseleave="$event.target.style.borderColor='#d1d5db';$event.target.style.color='#6b7280'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {{ t("添加搜索引擎") }}
              </button>
            </div>
          </div>
        </section>

        <!-- Other Features Settings -->
        <section id="section-other" class="settings-card">
          <h2>{{ t("其他辅助功能") }}</h2>
          <p class="section-desc">{{ t("管理浏览器扩展的其他增强体验与功能。") }}</p>

          <div style="margin-bottom: 24px; padding: 12px 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" v-model="settings.enableNumberConversion" style="margin: 0; width: 14px; height: 14px; cursor: pointer;" />
            <div>
              <div style="font-size: 13px; font-weight: 500; color: #111827;">{{ t("数字单位转换") }}</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">{{ t("自动识别 100 million、5 billion 等数字并转换为中文计量（1亿、50亿）") }}</div>
            </div>
          </div>

          <div style="margin-bottom: 24px; padding: 12px 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" v-model="settings.enableInlineSyllableRuby" style="margin: 0; width: 14px; height: 14px; cursor: pointer;" />
              <div>
                <div style="font-size: 13px; font-weight: 500; color: #111827;">{{ t("单击断音节") }}</div>
                <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">{{ t("点击英文单词时自动显示音节划分（如 un·pun·ished）") }}</div>
              </div>
            </div>
            
            <div v-if="settings.enableInlineSyllableRuby" style="padding-left: 22px; display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 12px; color: #4b5563;">{{ t("展示方式") }}</span>
              <select v-model="settings.syllableDisplayMode" style="flex: 1; max-width: 200px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; background: white; outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05); color: #111827;">
                <option value="badge">{{ t("气泡内展示 (推荐，零干扰)") }}</option>
                <option value="overlay">{{ t("图层覆盖 (如 Mac 原生词典)") }}</option>
                <option value="inline">{{ t("行内原位替换 (沉浸感更强)") }}</option>
              </select>
            </div>

            <!-- Syllable Mode Animations -->
            <div v-if="settings.enableInlineSyllableRuby" style="padding-left: 22px; margin-top: 4px;">
              <div class="anim-container anim-syl-container" :key="settings.syllableDisplayMode" style="height: 120px; padding: 16px 24px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #fafafa; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; position: relative;">
                <div style="font-size: 18px; color: #333; position: relative;">
                  <span>He left </span>
                  <span class="syl-target-word" style="position: relative; display: inline-block; cursor: pointer;">
                    <span class="syl-word-original">unpunished</span>
                    
                    <!-- Badge Mode -->
                    <div v-if="settings.syllableDisplayMode === 'badge'" class="syl-badge anim-syl-pop">
                      <div style="color: #B56B45; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; letter-spacing: 0.5px;">un·pun·ished</div>
                      <div style="color: #7eb8ff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; font-weight: 500;">/ʌnˈpʌnɪʃt/</div>
                    </div>

                    <!-- Overlay Mode -->
                    <div v-if="settings.syllableDisplayMode === 'overlay'" class="syl-overlay anim-syl-show">
                      un·pun·ished
                    </div>

                    <!-- Inline Mode -->
                    <span v-if="settings.syllableDisplayMode === 'inline'" class="syl-inline anim-syl-swap">
                      un·pun·ished
                    </span>

                    <div class="anim-click-ripple-syl"></div>
                  </span>
                  <span>.</span>
                </div>
                <svg class="anim-cursor anim-cursor-syl" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
              </div>
            </div>
          </div>
        </section>
      </template>

      <!-- Subtitles tab content -->
      <template v-else-if="activeTab === 'subtitles'">
        <!-- B站学习助手全局开关 -->
        <section id="section-bili-study" class="settings-card">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2 style="margin: 0;">{{ t("B站双语精读") }}</h2>
            <label class="switch-container" style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" v-model="settings.enableBiliStudy" class="switch-input" />
              <span class="switch-slider"></span>
            </label>
          </div>
          <p class="section-desc" style="margin-top: 8px; margin-bottom: 0;">{{ t("在 B 站视频中挂载 RTTR 学习面板、自定义双语字幕和 HUD 讲义") }}</p>
        </section>

        <!-- 字幕与视频交互行为设置 -->
        <section id="section-subtitle-behavior" v-if="settings.enableBiliStudy" class="settings-card">
          <h2>{{ t("字幕与视频交互行为") }}</h2>
          <p class="section-desc" style="margin-bottom: 24px;">{{ t("在 B 站视频中挂载 RTTR 学习面板、自定义双语字幕和 HUD 讲义") }}</p>

          <!-- 自动暂停视频 -->
          <div style="margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 16px;">
            <label class="switch-container" style="flex-shrink: 0; cursor: pointer;">
              <input type="checkbox" v-model="settings.biliAutoPause" class="switch-input" />
              <span class="switch-slider"></span>
            </label>
            <div>
              <div style="font-size: 13px; font-weight: 600; color: #111827;">{{ t("自动暂停视频") }}</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">{{ t("在播放过程中遇到重点生词或讲义卡片时自动暂停视频 (推荐，方便记录笔记)") }}</div>
            </div>
          </div>

          <!-- 自定义互动双语字幕 -->
          <div style="margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 16px;">
            <label class="switch-container" style="flex-shrink: 0; cursor: pointer;">
              <input type="checkbox" v-model="settings.biliCustomSubtitles" class="switch-input" />
              <span class="switch-slider"></span>
            </label>
            <div>
              <div style="font-size: 13px; font-weight: 600; color: #111827;">{{ t("自定义互动双语字幕") }}</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">{{ t("强力遮蔽 B 站原生低清字幕，渲染可完美进行单词悬停、音标查词和 AI 翻译的交互式双语字幕") }}</div>
            </div>
          </div>
        </section>

        <!-- 原生字幕智能交互卡片（独立卡片 + 动画演示） -->
        <section id="section-native-subtitle" v-if="settings.enableBiliStudy" class="settings-card">
          <h2>{{ t("原生字幕智能交互") }}</h2>
          <p class="section-desc" style="margin-bottom: 24px;">{{ t("悬停暂停 · 点击查词 · 单词高亮 · 移开继续") }}</p>

          <!-- 迷你动画演示区 -->
          <div class="hover-demo-player">
            <!-- 暗色视频背景 -->
            <div class="hover-demo-bg">
              <div class="hover-demo-particle hp1"></div>
              <div class="hover-demo-particle hp2"></div>
            </div>

            <!-- 暂停/播放状态指示器 -->
            <div class="hover-demo-state-badge pause-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              <span>已暂停</span>
            </div>
            <div class="hover-demo-state-badge play-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span>继续播放</span>
            </div>

            <!-- 模拟原生字幕栏 -->
            <div class="hover-demo-subtitle">
              <span class="hds-text">if a stray drop of metallic </span><span class="hds-text hds-target">solder</span><span class="hds-text"> or even high humidity bridges the wrong two paths,</span>
            </div>

            <!-- 模拟鼠标光标 -->
            <svg class="hover-demo-cursor" width="18" height="18" viewBox="0 0 24 24">
              <path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>

            <!-- 查词气泡 -->
            <div class="hover-demo-tooltip">
              <div style="font-family: ui-monospace, Menlo, Monaco, monospace; font-size: 9px; color: #38bdf8;">/ˈsɒldər/</div>
              <div style="font-size: 10px; color: #f3f4f6; margin-top: 2px;">组合，组装</div>
            </div>
          </div>

          <!-- 暂停模式选择 -->
          <div style="margin-top: 20px; padding: 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb;">
            <div style="font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 4px;">{{ t("悬停字幕自动暂停") }}</div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 12px;">{{ t("鼠标移到 B 站原生字幕上时自动暂停视频，移开后自动继续播放，方便您点击字幕单词查词发音") }}</div>
            <div class="segmented-control">
              <label class="seg-option" :class="{ active: settings.biliSubtitleHoverPause === 'off' }">
                <input type="radio" v-model="settings.biliSubtitleHoverPause" value="off" style="display: none;" />
                <span>{{ t("关闭") }}</span>
              </label>
              <label class="seg-option" :class="{ active: settings.biliSubtitleHoverPause === 'hover' }">
                <input type="radio" v-model="settings.biliSubtitleHoverPause" value="hover" style="display: none;" />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z"/></svg>
                <span>{{ t("悬停暂停") }}</span>
              </label>
              <label class="seg-option" :class="{ active: settings.biliSubtitleHoverPause === 'click' }">
                <input type="radio" v-model="settings.biliSubtitleHoverPause" value="click" style="display: none;" />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M15 15l-2 5L9 9l11 4-5 2z"/><path d="M2 12h3M12 2v3M4.93 4.93l2.12 2.12"/></svg>
                <span>{{ t("点击暂停") }}</span>
              </label>
            </div>
          </div>
        </section>

        <!-- 精读讲义 HUD 卡片 -->
        <section v-if="settings.enableBiliStudy" class="settings-card">
          <div style="padding: 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; gap: 16px;">
            <label class="switch-container" style="flex-shrink: 0; cursor: pointer;">
              <input type="checkbox" v-model="settings.biliHudVisible" class="switch-input" />
              <span class="switch-slider"></span>
            </label>
            <div>
              <div style="font-size: 13px; font-weight: 600; color: #111827;">{{ t("精读讲义 HUD 卡片") }}</div>
              <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">{{ t("默认在播放器中以半透明磨砂玻璃卡片呈现当前句子的重点讲义和释义") }}</div>
            </div>
          </div>
        </section>

        <!-- 字幕与视频联动演示 -->
        <section id="section-subtitle-demo" v-if="settings.enableBiliStudy" class="settings-card">
          <h2>{{ t("字幕与视频联动演示") }}</h2>
          <p class="section-desc" style="margin-bottom: 24px;">{{ t("实时高精度同步 · 单词悬停查词 · 一键 A-B 单句循环") }}</p>

          <div class="bili-mock-player">
            <!-- Simulated Video Content (gorgeous background particles) -->
            <div class="bili-video-canvas">
              <div class="bili-video-particle p1"></div>
              <div class="bili-video-particle p2"></div>
              <div class="bili-video-particle p3"></div>
            </div>

            <!-- Simulated HUD widget (glassmorphism notes) -->
            <div class="bili-hud-card" :class="{ 'hud-visible': settings.biliHudVisible }">
              <div class="hud-header" style="display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: bold; color: rgba(255,255,255,0.7); margin-bottom: 4px;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>RTTR HUD LECTURE NOTES</span>
              </div>
              <div class="hud-body" style="font-size: 11px; color: #ffffff; line-height: 1.4;">
                <strong style="color: #00aeec;">Premium</strong>: High quality, superior value. <span style="color: #888; font-size: 10px;">/ ˈpriːmiəm /</span><br/>
                <span style="color: #ccc; font-style: italic; font-size: 10px;">e.g. This extension provides a premium language learning experience.</span>
              </div>
            </div>

            <!-- Custom Bilingual Subtitles overlay -->
            <div class="bili-subtitles-wrap" :class="{ 'custom-subs-active': settings.biliCustomSubtitles }">
              <!-- When custom subtitles are active -->
              <template v-if="settings.biliCustomSubtitles">
                <div class="sub-line en-line">
                  <span>This is a </span>
                  <span class="sub-target-word">
                    <span class="highlight-word">premium</span>
                    <!-- Ruby tooltip popup -->
                    <div class="sub-word-tooltip">
                      <div class="tooltip-ipa">/ ˈpriːmiəm /</div>
                      <div class="tooltip-trans">高级的，优质的</div>
                    </div>
                  </span>
                  <span> language learning assistant.</span>
                </div>
                <div class="sub-line zh-line">这是一个优质的语言学习助手。</div>
              </template>
              
              <!-- When fallback to Bilibili default subtitles -->
              <template v-else>
                <div class="bili-native-subtitle">This is a premium language learning assistant. 这是一个优质的语言学习助手。</div>
              </template>
            </div>

            <!-- Simulated Mouse Cursor -->
            <svg class="bili-player-cursor" width="20" height="20" viewBox="0 0 24 24">
              <path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>

            <!-- Custom Player Control Bar -->
            <div class="bili-player-controls">
              <!-- Timeline progress -->
              <div class="progress-bar-wrap">
                <div class="progress-bar-bg"></div>
                <div class="progress-bar-fill"></div>
                <div class="progress-bar-handle"></div>
              </div>
              
              <div class="controls-bottom">
                <div class="controls-left">
                  <!-- Play icon -->
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="cursor: pointer;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span class="time-display" style="font-size: 10px; color: #aaa; margin-left: 6px;">00:15 / 03:40</span>
                </div>
                
                <div class="controls-right" style="display: flex; align-items: center; gap: 12px;">
                  <!-- Custom Stack Button -->
                  <div class="bili-control-btn active" style="display: flex; align-items: center; gap: 4px; color: #00aeec; font-size: 10px; font-weight: bold; cursor: pointer;">
                    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
                      <path d="M12 3L3 7.5L12 12L21 7.5L12 3Z" />
                      <path d="M3 10.5L12 15L21 10.5V12L12 16.5L3 12V10.5Z" />
                      <path d="M3 15L12 19.5L21 15V16.5L12 21L3 16.5V15Z" />
                    </svg>
                    <span>精读</span>
                  </div>
                  
                  <span class="control-normal-btn" style="font-size: 10px; color: #888;">1.0x</span>
                  <span class="control-normal-btn" style="font-size: 10px; color: #888;">宽屏</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Auto Save indicator for Subtitles tab -->
        <div class="actions" style="margin-top: 16px; border: none; padding-top: 0; justify-content: flex-end;">
          <span class="save-status" :class="{ visible: saved }" style="font-size: 13px; color: #737373;">{{ t("✓ 已自动保存") }}</span>
        </div>
      </template>
    </main>
    </div>
  </div>
</template>

<style>
/* Global reset for options page */
body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}
</style>

<style scoped>
.options-container {
  min-height: 100vh;
  background: #ffffff;
  color: #171717;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 60px;
}

.header {
  width: 100%;
  padding: 16px 40px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid #e5e5e5;
  margin-bottom: 40px;
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-actions .label {
  margin: 0;
  white-space: nowrap;
}

.header-actions .select {
  margin: 0;
  min-width: 150px;
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 6px;
  width: auto;
}

.logo-icon {
  width: 32px;
  height: 32px;
  display: block;
}

.logo-text {
  font-weight: 600;
  font-size: 18px;
  color: #171717;
  letter-spacing: 0.5px;
}

.content {
  width: 100%;
  max-width: 640px;
  padding: 0 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.settings-layout {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.settings-sidebar {
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: rgba(244, 244, 245, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(228, 228, 231, 0.6);
  border-radius: 12px;
  box-sizing: border-box;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-nav-item {
  display: block;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: #27272a; /* zinc-800: high-contrast dark text */
  text-decoration: none;
  border-radius: 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-nav-item:hover {
  color: #00aeec;
  background: rgba(0, 174, 236, 0.04);
}

.sidebar-nav-item.active {
  color: #00aeec !important;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03), 0 1px 3px rgba(0, 0, 0, 0.01);
  font-weight: 600;
}

@media (min-width: 1150px) {
  .settings-sidebar {
    position: fixed;
    left: calc(50% - 320px - 220px - 32px);
    top: 120px;
  }
}

@media (max-width: 1149px) and (min-width: 900px) {
  .settings-layout {
    flex-direction: row;
    gap: 32px;
    width: auto;
    max-width: 960px;
    justify-content: center;
    align-items: flex-start;
  }
  .settings-sidebar {
    position: sticky;
    top: 120px;
  }
}

@media (max-width: 899px) {
  .settings-sidebar {
    width: 100%;
    max-width: 640px;
    margin-bottom: 24px;
  }
}

.settings-card {
  background: #ffffff;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

.settings-card h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #171717;
}

.section-desc {
  color: #737373;
  font-size: 13px;
  margin-bottom: 32px;
}

.form-group {
  margin-bottom: 24px;
}

.form-row {
  display: flex;
  gap: 16px;
}
.form-row .half {
  flex: 1;
}

.label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #737373;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.input, .select {
  width: 100%;
  padding: 10px 12px;
  background: #f5f5f5;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  color: #171717;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.select option {
  background: #ffffff;
  color: #171717;
}

.input:focus, .select:focus {
  border-color: #171717;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(23, 23, 23, 0.1);
}

.input-with-toggle {
  position: relative;
}

.input-with-toggle .input {
  padding-right: 36px;
}

.eye-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #737373;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-picker {
  width: 32px;
  height: 32px;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  cursor: pointer;
  background: #f5f5f5;
  padding: 2px;
}

.color-value {
  font-size: 13px;
  color: #737373;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.slider {
  width: 100%;
  accent-color: #171717;
}

.actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #e5e5e5;
}

.test-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 24px;
  background: #171717;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  white-space: nowrap;
}

.test-btn:hover {
  background: #333333;
}

.test-btn:active {
  transform: scale(0.98);
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.test-btn.is-loading {
  background: #404040;
}

.spinner {
  animation: spin 1s linear infinite;
}

.playing-icon .wave1 {
  animation: audioWave 1s infinite;
}

.playing-icon .wave2 {
  animation: audioWave 1s infinite 0.2s;
}

@keyframes audioWave {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.test-result-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #10b981;
  font-weight: 500;
  animation: fadeIn 0.3s ease;
}

.test-result-inline.error {
  color: #ef4444;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}

.save-status {
  font-size: 13px;
  color: #737373;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.save-status.visible {
  opacity: 1;
}



/* Mode Animations & Previews */
.animation-previews {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.preview-box {
  flex: 1;
  border: 2px solid #e5e5e5;
  border-radius: 8px;
  padding: 16px;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}

.preview-box.active {
  border-color: #007aff;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.1);
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
  color: #737373;
  margin-bottom: 12px;
  text-align: center;
}

.preview-box.active .preview-title {
  color: #007aff;
}

.anim-container {
  position: relative;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 6px;
  font-size: 15px;
  font-family: -apple-system, sans-serif;
  color: #333;
}

.anim-text {
  position: relative;
}

.anim-selection {
  position: relative;
  display: inline-block;
  background: linear-gradient(to right, #b4d7ff 50%, transparent 50%);
  background-size: 200% 100%;
  background-position: 100% 0;
  border-radius: 2px;
}

.anim-badge {
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%) scale(0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
}

.anim-speaker {
  color: #0a84ff;
  display: block;
}

.anim-cursor {
  position: absolute;
  top: 10px;
  left: -5px;
  z-index: 10;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
  transform-origin: top left;
}

.anim-click-ripple {
  position: absolute;
  top: 10px;
  left: 45px;
  width: 20px;
  height: 20px;
  border: 2px solid #007aff;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

/* Keyframes for Auto Mode */
.anim-auto .anim-cursor {
  animation: autoCursorDrag 4s infinite;
}
.anim-auto .anim-selection {
  animation: autoSelectionHighlight 4s infinite;
}
.anim-auto .anim-badge {
  animation: badgePopAuto 4s infinite;
}
.anim-auto .wave1, .anim-auto .wave2 {
  animation: wavePulse 4s infinite;
}

/* Keyframes for Click Mode */
.anim-click .anim-cursor {
  animation: clickCursorDragAndClick 4s infinite;
}
.anim-click .anim-selection {
  animation: clickSelectionHighlight 4s infinite;
}
.anim-click .anim-badge {
  animation: badgePopClick 4s infinite;
}
.anim-click .anim-click-ripple {
  animation: clickRipple 4s infinite;
}
.anim-click .wave1, .anim-click .wave2 {
  animation: wavePulseClick 4s infinite;
}

@keyframes autoCursorDrag {
  0%, 15% { transform: translate(0, 0); }
  35% { transform: translate(90px, 0); }
  45%, 100% { transform: translate(110px, 20px); }
}

@keyframes autoSelectionHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes badgePopAuto {
  0%, 35% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.8); }
  40%, 90% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  95%, 100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

@keyframes wavePulse {
  0%, 40% { opacity: 0; }
  45%, 55%, 65%, 75% { opacity: 1; }
  50%, 60%, 70%, 80% { opacity: 0.3; }
  85%, 100% { opacity: 0; }
}

.anim-badge-black {
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%) scale(0.8);
  background: rgba(28, 28, 30, 0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #7eb8ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  box-shadow: 0 3px 12px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.06);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
}
.anim-badge-black::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  border-width: 4px 4px 0;
  border-style: solid;
  border-color: rgba(28, 28, 30, 0.92) transparent transparent transparent;
}

@keyframes clickCursorDragAndClick {
  0%, 15% { transform: translate(0, 0) scale(1); }
  35% { transform: translate(90px, 0) scale(1); }
  45%, 55% { transform: translate(110px, 20px) scale(1); }
  65% { transform: translate(45px, 0) scale(1); }
  70% { transform: translate(45px, 0) scale(0.85); }
  75% { transform: translate(45px, 0) scale(1); }
  85%, 100% { transform: translate(110px, 20px) scale(1); }
}

@keyframes clickSelectionHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes clickRipple {
  0%, 69% { opacity: 0; transform: translate(-50%, -50%) scale(0.1); }
  70% { opacity: 1; transform: translate(-50%, -50%) scale(0.1); }
  75% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
  76%, 100% { opacity: 0; }
}

@keyframes badgePopClick {
  0%, 72% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.8); }
  76%, 95% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

@keyframes wavePulseClick {
  0%, 75% { opacity: 0; }
  78%, 86% { opacity: 1; }
  82%, 90% { opacity: 0.3; }
  94%, 100% { opacity: 0; }
}

/* Keyframes for Shortcut Mode */
.anim-shortcut .anim-cursor {
  animation: shortcutCursorDrag 4s infinite;
}
.anim-shortcut .anim-selection {
  animation: shortcutSelectionHighlight 4s infinite;
}
.anim-shortcut .anim-badge {
  animation: badgePopShortcut 4s infinite;
}
.anim-shortcut .wave1, .anim-shortcut .wave2 {
  animation: wavePulseShortcut 4s infinite;
}
.anim-keyboard-key {
  position: absolute;
  bottom: 15px;
  right: 15px;
  width: 28px;
  height: 28px;
  background: #fdfdfd;
  border: 1px solid #d4d4d4;
  border-bottom: 3px solid #d4d4d4;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #333;
  opacity: 0;
  animation: keyboardKeyPress 4s infinite;
}

@keyframes shortcutCursorDrag {
  0%, 15% { transform: translate(0, 0); }
  35% { transform: translate(90px, 0); }
  45%, 100% { transform: translate(110px, 20px); }
}

@keyframes shortcutSelectionHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes badgePopShortcut {
  0%, 55% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.8); }
  60%, 90% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  95%, 100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

@keyframes wavePulseShortcut {
  0%, 60% { opacity: 0; }
  65%, 75% { opacity: 1; }
  70%, 80% { opacity: 0.3; }
  85%, 100% { opacity: 0; }
}

@keyframes keyboardKeyPress {
  0%, 45% { opacity: 0; transform: translateY(10px); }
  50% { opacity: 1; transform: translateY(0); border-bottom-width: 3px; background: #fdfdfd; }
  55% { opacity: 1; transform: translateY(2px); border-bottom-width: 1px; background: #f0f0f0; }
  60% { opacity: 1; transform: translateY(0); border-bottom-width: 3px; background: #fdfdfd; }
  85%, 100% { opacity: 0; transform: translateY(0); }
}

/* Keyframes for Single Click */
.anim-single-click .anim-cursor {
  animation: singleClickCursor 4s infinite;
}
.anim-single-click .anim-badge-black,
.anim-single-click .anim-badge {
  animation: badgePopSingleClick 4s infinite;
}
.anim-single-click .anim-click-ripple {
  animation: singleClickRipple 4s infinite;
}
.anim-single-click .wave1, .anim-single-click .wave2 {
  animation: wavePulseSingleClick 4s infinite;
}

@keyframes singleClickCursor {
  0%, 15% { transform: translate(-30px, 20px) scale(1); }
  35% { transform: translate(25px, 0px) scale(1); }
  45% { transform: translate(25px, 0px) scale(0.85); }
  50%, 65% { transform: translate(25px, 0px) scale(1); }
  75%, 100% { transform: translate(-30px, 20px) scale(1); }
}

@keyframes singleClickRipple {
  0%, 44% { opacity: 0; transform: translate(-50%, -50%) scale(0.1); }
  45% { opacity: 1; transform: translate(-50%, -50%) scale(0.1); }
  50% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
  51%, 100% { opacity: 0; }
}

@keyframes badgePopSingleClick {
  0%, 46% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.8); }
  50%, 80% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  85%, 100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

@keyframes wavePulseSingleClick {
  0%, 50% { opacity: 0; }
  53%, 63%, 73% { opacity: 1; }
  58%, 68%, 78% { opacity: 0.3; }
  83%, 100% { opacity: 0; }
}

/* Translation Preview Animations */
.trans-target-word {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.anim-translation .trans-ipa-badge {
  opacity: 0;
  animation: transIpaPop 4s infinite;
}

.anim-translation .anim-cursor-trans {
  position: absolute;
  top: 10px;
  left: -5px;
  z-index: 10;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
  transform-origin: top left;
  animation: transClickCursor 4s infinite;
}

.anim-translation .anim-click-ripple-trans {
  position: absolute;
  top: 10px;
  left: 30px;
  width: 20px;
  height: 20px;
  border: 2px solid #007aff;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: singleClickRipple 4s infinite;
}

.anim-translation-tooltip-bottom,
.anim-translation-tooltip-top {
  position: absolute;
  left: 50%;
  transform: translateX(-50%); /* Base centering to fix offset */
  background-color: #f0f0f0;
  color: #333333;
  border: 1px solid #dcdcdc;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 6px 10px;
  font-size: 13px;
  z-index: 20;
  border-radius: 0px;
  pointer-events: none;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: left;
  gap: 8px;
  white-space: nowrap;
  width: max-content;
}

.anim-translation-tooltip-bottom {
  top: 30px;
  animation: transTooltipPopBottom 4s infinite;
}

.anim-translation-tooltip-top {
  top: -68px; /* High enough above the IPA badge */
  animation: transTooltipPopTop 4s infinite;
  z-index: 30;
}

.anim-translation-tooltip-bottom .engine-tag,
.anim-translation-tooltip-top .engine-tag {
  font-size: 10px;
  color: #888;
  border-left: 1px solid #ccc;
  padding-left: 8px;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
}

@keyframes transClickCursor {
  0%, 15% { transform: translate(-30px, 20px) scale(1); }
  35% { transform: translate(30px, 0px) scale(1); }
  45% { transform: translate(30px, 0px) scale(0.85); }
  50%, 75% { transform: translate(30px, 0px) scale(1); }
  85%, 100% { transform: translate(-30px, 20px) scale(1); }
}

@keyframes transTooltipPopBottom {
  0%, 46% { opacity: 0; margin-top: -5px; }
  50%, 80% { opacity: 1; margin-top: 0px; }
  85%, 100% { opacity: 0; margin-top: 5px; }
}

@keyframes transTooltipPopTop {
  0%, 46% { opacity: 0; margin-top: 5px; }
  50%, 80% { opacity: 1; margin-top: 0px; }
  85%, 100% { opacity: 0; margin-top: -5px; }
}

@keyframes transIpaPop {
  0%, 46% { opacity: 0; transform: translateX(-50%) translateY(5px) scale(0.9); }
  50%, 80% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  85%, 100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

/* ─── Selection Auto-Translate Animations ─── */
.anim-sel-trans-auto .anim-cursor {
  animation: selTransAutoCursor 4s infinite;
}
.anim-sel-trans-auto .sel-trans-sel {
  animation: selTransAutoHighlight 4s infinite;
}
.anim-sel-trans-auto .sel-trans-tooltip-auto {
  animation: selTransAutoTooltip 4s infinite;
}

@keyframes selTransAutoCursor {
  0%, 15% { transform: translate(0, 0) scale(1); }
  35% { transform: translate(90px, 0) scale(1); }
  45%, 100% { transform: translate(110px, 20px) scale(1); }
}

@keyframes selTransAutoHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes selTransAutoTooltip {
  0%, 37% { opacity: 0; margin-top: -5px; }
  42%, 90% { opacity: 1; margin-top: 0px; }
  95%, 100% { opacity: 0; margin-top: 5px; }
}

/* ─── Selection Click-Translate Animations ─── */
.anim-sel-trans-click .anim-cursor {
  animation: selTransClickCursor 4s infinite;
}
.anim-sel-trans-click .sel-trans-sel-click {
  animation: selTransClickHighlight 4s infinite;
}
.anim-sel-trans-click .sel-trans-tooltip-click {
  animation: selTransClickTooltip 4s infinite;
}
.anim-sel-trans-click .sel-trans-ripple {
  animation: selTransClickRipple 4s infinite;
}

@keyframes selTransClickCursor {
  0%, 15% { transform: translate(0, 0) scale(1); }
  35% { transform: translate(90px, 0) scale(1); }
  45%, 55% { transform: translate(110px, 20px) scale(1); }
  65% { transform: translate(45px, 0) scale(1); }
  70% { transform: translate(45px, 0) scale(0.85); }
  75% { transform: translate(45px, 0) scale(1); }
  85%, 100% { transform: translate(110px, 20px) scale(1); }
}

@keyframes selTransClickHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes selTransClickRipple {
  0%, 69% { opacity: 0; transform: translate(-50%, -50%) scale(0.1); }
  70% { opacity: 1; transform: translate(-50%, -50%) scale(0.1); }
  75% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
  76%, 100% { opacity: 0; }
}

@keyframes selTransClickTooltip {
  0%, 72% { opacity: 0; margin-top: -5px; }
  76%, 92% { opacity: 1; margin-top: 0px; }
  97%, 100% { opacity: 0; margin-top: 5px; }
}

/* ─── Selection LongPress-Translate Animations ─── */
.anim-sel-trans-longpress .anim-cursor {
  animation: selTransLongPressCursor 4s infinite;
}
.anim-sel-trans-longpress .sel-trans-sel-longpress {
  animation: selTransClickHighlight 4s infinite;
}
.anim-sel-trans-longpress .sel-trans-tooltip-longpress {
  animation: selTransLongPressTooltip 4s infinite;
}
.anim-sel-trans-longpress .anim-longpress-ring-container {
  position: absolute;
  top: 15px;
  left: 45px;
  width: 32px;
  height: 32px;
  margin-top: -16px;
  margin-left: -16px;
  pointer-events: none;
  animation: selTransLongPressRingContainer 4s infinite;
}
.anim-sel-trans-longpress .anim-longpress-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.anim-sel-trans-longpress .anim-longpress-ring .ring-progress {
  fill: transparent;
  stroke: #4a90d9;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 87.96;
  stroke-dashoffset: 87.96;
  opacity: 0.6;
  animation: selTransLongPressRing 4s infinite;
}

@keyframes selTransLongPressCursor {
  0%, 15% { transform: translate(0, 0) scale(1); }
  30% { transform: translate(90px, 0) scale(1); }
  40%, 45% { transform: translate(110px, 20px) scale(1); }
  55% { transform: translate(45px, 0) scale(1); }
  60%, 75% { transform: translate(45px, 0) scale(0.85); }
  80% { transform: translate(45px, 0) scale(1); }
  85%, 100% { transform: translate(110px, 20px) scale(1); }
}

@keyframes selTransLongPressRingContainer {
  0%, 57% { opacity: 0; transform: scale(1); }
  60% { opacity: 1; transform: scale(1); }
  75% { opacity: 1; transform: scale(1); }
  78% { opacity: 0; transform: scale(1.15); }
  79%, 100% { opacity: 0; transform: scale(1); }
}

@keyframes selTransLongPressRing {
  0%, 59% { stroke-dashoffset: 87.96; }
  60% { stroke-dashoffset: 87.96; }
  75% { stroke-dashoffset: 0; }
  76%, 100% { stroke-dashoffset: 0; }
}

@keyframes selTransLongPressTooltip {
  0%, 75% { opacity: 0; margin-top: -5px; }
  79%, 92% { opacity: 1; margin-top: 0px; }
  97%, 100% { opacity: 0; margin-top: 5px; }
}

/* ─── Paragraph Translation (Ruby) Animations ─── */
.anim-paragraph-trans {
  position: relative;
  overflow: hidden;
}

.anim-ruby-wrapper {
  display: inline-block;
  position: relative;
  text-align: center;
  line-height: 1; /* Fix line-height to prevent bottom: 100% from floating too high */
}

/* Base text is normal color initially, then animates */
.anim-ruby-base {
  display: inline-block;
  color: inherit; 
}

.ruby-color-1 .anim-ruby-base {
  animation: rubyBaseColor1 6s infinite;
}

@keyframes rubyBaseColor1 {
  0%, 55% { color: inherit; }
  56%, 85% { color: #10b981; }
  90%, 100% { color: inherit; }
}

.ruby-color-2 .anim-ruby-base {
  animation: rubyBaseColor2 6s infinite;
}

@keyframes rubyBaseColor2 {
  0%, 55% { color: inherit; }
  56%, 85% { color: #3b82f6; }
  90%, 100% { color: inherit; }
}

.anim-paragraph-text {
  animation: paragraphTextGray 6s infinite;
  transition: color 0.2s;
}

@keyframes paragraphTextGray {
  0%, 24% { color: #333; }
  26%, 55% { color: #9ca3af; } /* Turn gray right after shortcut (25%) for loading state */
  56%, 85% { color: #333; } /* Restore to black when translation finishes */
  90%, 100% { color: #333; }
}

.anim-paragraph-spinner {
  display: inline-block;
  vertical-align: text-bottom;
  margin-left: 6px;
  margin-bottom: 2px;
  animation: paragraphSpinnerOp 6s infinite;
}

@keyframes paragraphSpinnerOp {
  0%, 24% { opacity: 0; transform: rotate(0deg); }
  26% { opacity: 1; transform: rotate(0deg); }
  55% { opacity: 1; transform: rotate(1044deg); } /* Spin roughly 3 times */
  56%, 100% { opacity: 0; transform: rotate(1044deg); }
}

.anim-ruby-text {
  position: absolute;
  bottom: calc(100% + 2px); /* Position slightly above the word */
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  animation: rubyTextFadeIn 6s infinite;
}

.ruby-color-1 .anim-ruby-text {
  color: #10b981; /* Emerald green */
}

.ruby-color-2 .anim-ruby-text {
  color: #3b82f6; /* Blue */
  animation-delay: 0.1s;
}

@keyframes rubyTextFadeIn {
  0%, 55% { opacity: 0; transform: translateX(-50%) translateY(5px) scale(0.9); }
  56%, 85% { opacity: 1; transform: translateX(-50%) translateY(-2px) scale(1); }
  90%, 100% { opacity: 0; transform: translateX(-50%) translateY(0px) scale(0.9); }
}

.anim-floating-shortcut {
  position: absolute;
  bottom: 16px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  animation: floatingShortcutAnim 6s infinite;
}

.shortcut-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.shortcut-plus {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  color: #6b7280;
  font-weight: 600;
}

.anim-floating-shortcut .key {
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 6px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 12px;
  color: #374151;
  box-shadow: 0 2px 0 #d1d5db;
  transition: all 0.1s;
}

.anim-floating-shortcut .key-modifier {
  padding-left: 7px;
  padding-right: 7px;
  letter-spacing: 0;
}

.anim-floating-shortcut .key-main {
  min-width: 16px;
  text-align: center;
  font-weight: 600;
  padding-left: 5px;
  padding-right: 5px;
}

@keyframes floatingShortcutAnim {
  0%, 10% { opacity: 0; transform: translateY(10px); }
  15%, 23% { opacity: 1; transform: translateY(0); }
  /* Key press effect */
  25% { transform: translateY(2px); }
  26%, 45% { opacity: 1; transform: translateY(0); }
  /* Fade out right as translation pops up (56%) */
  50%, 100% { opacity: 0; transform: translateY(10px); }
}

.anim-paragraph-cursor {
  position: absolute;
  top: 50%;
  left: 30%;
  animation: paragraphCursorAnim 6s infinite;
  z-index: 10;
}

@keyframes paragraphCursorAnim {
  0%, 5% { transform: translate(-80px, 80px); opacity: 0; }
  10%, 15% { transform: translate(0px, 0px); opacity: 1; }
  /* Hover while keyboard is pressed and translation happens */
  15%, 85% { transform: translate(0px, 0px); opacity: 1; }
  90%, 100% { transform: translate(-80px, 80px); opacity: 0; }
}

/* Inline Paragraph Translation Animation (Shift key demo) */
.anim-inline-para-translated {
  font-size: 13px;
  line-height: 1.7;
  color: #999;
  border-left: 3px solid #e0e0e0;
  padding: 6px 12px;
  margin-top: 6px;
  width: 100%;
  text-align: left;
  opacity: 0;
  transform: translateY(-4px);
  animation: inlineParaTranslated 5s infinite;
}

@keyframes inlineParaTranslated {
  0%, 40% { opacity: 0; transform: translateY(-4px); }
  50%, 80% { opacity: 1; transform: translateY(0); }
  90%, 100% { opacity: 0; transform: translateY(-4px); }
}

.anim-inline-shift-key {
  position: absolute;
  bottom: 16px;
  right: 24px;
  opacity: 0;
  animation: inlineShiftKeyAnim 5s infinite;
}

.anim-inline-shift-key .key {
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 10px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  box-shadow: 0 2px 0 #d1d5db;
}

@keyframes inlineShiftKeyAnim {
  0%, 15% { opacity: 0; transform: translateY(8px); }
  20%, 32% { opacity: 1; transform: translateY(0); }
  35% { transform: translateY(2px); }
  38%, 48% { opacity: 1; transform: translateY(0); }
  55%, 100% { opacity: 0; transform: translateY(8px); }
}

.anim-inline-para-cursor {
  position: absolute;
  top: 36%;
  left: 40%;
  z-index: 10;
  animation: inlineParaCursorAnim 5s infinite;
}

@keyframes inlineParaCursorAnim {
  0%, 5% { transform: translate(-60px, 60px); opacity: 0; }
  12%, 80% { transform: translate(0, 0); opacity: 1; }
  90%, 100% { transform: translate(-60px, 60px); opacity: 0; }
}

/* Syllable Modes Animations */
.anim-cursor-syl {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 10;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
  transform-origin: top left;
  animation: sylClickCursor 4s infinite;
}

.anim-click-ripple-syl {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  margin-top: -10px;
  margin-left: -10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 50%;
  pointer-events: none;
  animation: sylClickRipple 4s infinite;
}

@keyframes sylClickCursor {
  0%, 15% { transform: translate(-80px, 40px) scale(1); }
  35% { transform: translate(15px, 0px) scale(1); }
  45% { transform: translate(15px, 0px) scale(0.85); }
  50%, 75% { transform: translate(15px, 0px) scale(1); }
  85%, 100% { transform: translate(-80px, 40px) scale(1); }
}

@keyframes sylClickRipple {
  0%, 44% { opacity: 0; transform: scale(0.1); }
  45% { opacity: 1; transform: scale(0.1); }
  50% { opacity: 0; transform: scale(1.5); }
  100% { opacity: 0; }
}

/* Badge Mode */
.syl-badge {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  background: rgba(28, 28, 30, 0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 3px 10px;
  border-radius: 6px;
  box-shadow: 0 3px 12px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.06);
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
  z-index: 5;
  opacity: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.syl-badge::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px;
  border-style: solid;
  border-color: rgba(28, 28, 30, 0.92) transparent transparent transparent;
}
.anim-syl-pop {
  animation: sylBadgePop 4s infinite;
}
@keyframes sylBadgePop {
  0%, 46% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.8); }
  50%, 80% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  85%, 100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

/* Overlay Mode */
.syl-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  background: #fdf012;
  box-shadow: 0 0 0 1px rgba(220, 200, 0, 0.8);
  white-space: nowrap;
  padding: 0 4px;
  z-index: 5;
  pointer-events: none;
  opacity: 0;
}
.anim-syl-show {
  animation: sylOverlayShow 4s infinite;
}
@keyframes sylOverlayShow {
  0%, 46% { opacity: 0; transform: translate(-50%, -50%); }
  50%, 80% { opacity: 1; transform: translate(-50%, -50%); }
  85%, 100% { opacity: 0; transform: translate(-50%, -50%); }
}

/* Inline Mode */
.syl-inline {
  position: absolute;
  top: 0;
  left: 0;
  color: #B56B45; /* Match real inline syllable color */
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
}
.anim-syl-swap {
  animation: sylInlineShow 4s infinite;
}
@keyframes sylInlineShow {
  0%, 46% { opacity: 0; }
  50%, 80% { opacity: 1; }
  85%, 100% { opacity: 0; }
}

.syl-target-word:has(.syl-inline) .syl-word-original {
  animation: sylInlineHide 4s infinite;
}
@keyframes sylInlineHide {
  0%, 46% { opacity: 1; color: inherit; }
  50%, 80% { opacity: 0; color: transparent; }
  85%, 100% { opacity: 1; color: inherit; }
}

/* --- Vue State-Driven Demo Styles --- */
.demo-sep {
  display: inline;
  font-size: 0px;
  color: transparent;
  margin: 0;
  vertical-align: middle;
  transition: all 0.3s ease;
}
.demo-sep-visible {
  display: inline-block;
  color: #007aff;
  margin: 0 1px;
  font-size: 1.6em;
  line-height: 1;
  vertical-align: middle;
}

.demo-menu {
  position: absolute;
  left: calc(48% + 18px); top: calc(38% - 6px);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
  padding: 4px;
  opacity: 0;
  transform: scale(0.92) translateY(4px);
  transform-origin: top left;
  pointer-events: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 10;
}
.demo-menu-visible {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.demo-trans-popup {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  padding: 4px 8px;
  opacity: 0;
  transform: scale(0.92) translateY(-4px);
  transform-origin: top left;
  pointer-events: none;
  z-index: 10;
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.demo-trans-popup.popup-visible {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.demo-menu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px;
  font-size: 12px; font-weight: 500;
  border-radius: 5px; white-space: nowrap;
  transition: all 0.15s ease;
}
.demo-menu-item svg { flex-shrink: 0; }

.demo-cursor {
  position: absolute;
  transition: all 0.6s cubic-bezier(0.25, 1, 0.5, 1);
  z-index: 20;
}
.cursor-start { left: 82%; top: 72%; opacity: 0; }
.cursor-target { left: 48%; top: 38%; opacity: 1; }
.cursor-menu { left: calc(48% + 30px); top: calc(38% + 10px); opacity: 1; }
.cursor-hide { left: calc(48% + 30px); top: calc(38% + 10px); opacity: 0; }

.demo-mouse-indicator {
  position: absolute;
  bottom: 16px;
  right: 16px;
  opacity: 0.6;
  z-index: 10;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: translateY(0);
}
.demo-mouse-indicator.mouse-hidden {
  opacity: 0;
  transform: translateY(10px);
}

.demo-key-indicator {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  background: #fff;
  border: 2px solid #e5e7eb;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 10;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}
.demo-key-indicator.key-visible {
  opacity: 1;
  transform: translateY(0);
}
.demo-key-indicator.key-pressed {
  background: #e5e7eb;
  color: #374151;
  border-color: #d1d5db;
  transform: translateY(2px) scale(0.95);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.demo-ripple {
  position: absolute;
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(0,122,255,0.6);
  left: calc(48% + 4px); top: calc(38% + 4px);
  transform: scale(0.3);
  pointer-events: none;
  animation: demoRippleAnim 0.4s ease-out forwards;
  z-index: 15;
}
@keyframes demoRippleAnim {
  0%   { opacity: 1; transform: scale(0.3); }
  100% { opacity: 0; transform: scale(2.5); }
}

/* --- Focus Mode Selector Styles --- */
.focus-keys-hint {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.focus-key-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.focus-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px; height: 22px;
  padding: 0 5px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 11px; font-weight: 600;
  color: #374151;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  font-family: system-ui, -apple-system, sans-serif;
}

.focus-key-long {
  position: relative;
  background: linear-gradient(135deg, #fff 60%, #e0e7ff);
  border-color: #818cf8;
  color: #4338ca;
}
.focus-key-long::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 6px;
  border: 1.5px solid rgba(99,102,241,0.4);
  animation: focusKeyPulse 2s ease-in-out infinite;
  pointer-events: none;
}
@keyframes focusKeyPulse {
  0%, 100% { opacity: 0; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}

.focus-key-label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: #6b7280;
  font-weight: 500;
  white-space: nowrap;
}

/* Glassmorphic Tabs Bar */
.tabs-nav-bar {
  display: flex;
  background: rgba(244, 244, 245, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
  border: 1px solid rgba(228, 228, 231, 0.6);
  margin-bottom: 0;
  width: 220px;
  box-sizing: border-box;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 6px 12px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  color: #71717a;
  border-radius: 7px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
}

.tab-btn:hover {
  color: #0f0f10;
  background: rgba(255, 255, 255, 0.4);
}

.tab-btn.active {
  color: #00aeec; /* Elegant Bilibili Brand Blue */
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02);
}

.tab-btn svg {
  transition: transform 0.3s ease;
}

.tab-btn.active svg {
  transform: scale(1.1);
}

/* Elegant Master Toggles */

/* Segmented control (3-option radio) */
.segmented-control {
  display: flex;
  gap: 6px;
  background: #e8eaed;
  border-radius: 10px;
  padding: 3px;
}

.seg-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.seg-option:hover {
  color: #374151;
  background: rgba(255, 255, 255, 0.5);
}

.seg-option.active {
  color: #00aeec;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  font-weight: 600;
}
.switch-container {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.switch-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #e4e4e7;
  transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 22px;
}

.switch-slider::before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.switch-input:checked + .switch-slider {
  background-color: #00aeec;
}

.switch-input:checked + .switch-slider::before {
  transform: translateX(18px);
}

.switch-input:focus-visible + .switch-slider {
  box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.2);
}

/* Simulated Mock Player */
.bili-mock-player {
  position: relative;
  width: 100%;
  height: 320px;
  background: #0f141c;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
}

.bili-video-canvas {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #0e1726 0%, #060b13 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.bili-video-particle {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 174, 236, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
  filter: blur(20px);
}

.bili-video-particle.p1 {
  width: 300px;
  height: 300px;
  top: -50px;
  left: -50px;
  animation: floatParticle1 20s infinite alternate;
}

.bili-video-particle.p2 {
  width: 250px;
  height: 250px;
  bottom: -50px;
  right: -50px;
  animation: floatParticle2 15s infinite alternate;
}

.bili-video-particle.p3 {
  width: 180px;
  height: 180px;
  top: 100px;
  right: 200px;
  animation: floatParticle3 18s infinite alternate;
}

@keyframes floatParticle1 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(40px, 30px) scale(1.1); }
}

@keyframes floatParticle2 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(-30px, -40px) scale(1.1); }
}

@keyframes floatParticle3 {
  0% { transform: translate(0, 0) scale(0.9); }
  100% { transform: translate(20px, -20px) scale(1.2); }
}

/* Glassmorphism HUD notes */
.bili-hud-card {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 220px;
  background: rgba(20, 26, 38, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  transform: translateY(-10px) scale(0.95);
  opacity: 0;
  pointer-events: none;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 10;
}

.bili-hud-card.hud-visible {
  transform: translateY(0) scale(1);
  opacity: 1;
}

/* Interactive Bilingual Subtitles */
.bili-subtitles-wrap {
  position: absolute;
  bottom: 65px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  width: 90%;
  transition: all 0.3s ease;
  pointer-events: none;
  z-index: 5;
}

.sub-line {
  font-weight: 500;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.85);
  line-height: 1.4;
}

.en-line {
  font-size: 14px;
  color: #ffffff;
  margin-bottom: 4px;
}

.zh-line {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
}

.bili-native-subtitle {
  font-size: 12px;
  color: #d1d5db;
  line-height: 1.4;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}

.sub-target-word {
  position: relative;
  display: inline-block;
  pointer-events: auto;
  cursor: pointer;
}

.highlight-word {
  color: #00aeec;
  font-weight: 600;
  border-bottom: 1.5px dashed #00aeec;
  padding-bottom: 1px;
  transition: all 0.25s ease;
  animation: biliHighlightPulse 8s infinite ease-in-out;
}

/* Word Tooltip */
.sub-word-tooltip {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) translateY(4px) scale(0.92);
  background: rgba(18, 23, 33, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 8px;
  padding: 6px 10px;
  color: white;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
  white-space: nowrap;
  z-index: 15;
  text-shadow: none;
  text-align: center;
  animation: biliTooltipAnim 8s infinite ease-in-out;
}

.sub-word-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: rgba(18, 23, 33, 0.95);
}

.tooltip-ipa {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  color: #38bdf8;
  font-weight: 500;
}

.tooltip-trans {
  font-size: 11px;
  margin-top: 2px;
  color: #f3f4f6;
}

/* Simulated Mouse Cursor & Controls */
.bili-player-cursor {
  position: absolute;
  z-index: 30;
  pointer-events: none;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3));
  transform-origin: top left;
  animation: biliCursorMotion 8s infinite ease-in-out;
}

/* Player control bar */
.bili-player-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 100%);
  padding: 10px 14px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
  pointer-events: auto;
}

.progress-bar-wrap {
  position: relative;
  width: 100%;
  height: 3px;
  cursor: pointer;
  transition: height 0.15s ease;
}

.progress-bar-wrap:hover {
  height: 5px;
}

.progress-bar-bg {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.progress-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: #00aeec;
  border-radius: 3px;
  width: 19.16%;
  animation: biliProgressAnim 8s infinite linear;
}

.progress-bar-handle {
  position: absolute;
  top: 50%;
  left: 19.16%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transform: translate(-50%, -50%) scale(0);
  transition: transform 0.2s;
  z-index: 2;
  animation: biliProgressHandleAnim 8s infinite linear;
}

.progress-bar-wrap:hover .progress-bar-handle {
  transform: translate(-50%, -50%) scale(1);
}

.controls-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.controls-left, .controls-right {
  display: flex;
  align-items: center;
  color: #ffffff;
}

.control-normal-btn {
  font-size: 10px;
  color: #cccccc;
  cursor: pointer;
  font-weight: 500;
  transition: color 0.2s;
}

.control-normal-btn:hover {
  color: #ffffff;
}

.bili-control-btn {
  transition: all 0.25s ease;
  animation: biliControlBtnAnim 8s infinite ease-in-out;
}

/* Animations */
@keyframes biliCursorMotion {
  0%, 10% {
    left: 85%;
    top: 85%;
    opacity: 0;
  }
  15% {
    left: 85%;
    top: 85%;
    opacity: 1;
  }
  35% {
    left: 38%;
    top: 56%;
    opacity: 1;
  }
  70% {
    left: 38%;
    top: 56%;
    opacity: 1;
  }
  80% {
    left: 86%;
    top: 89%;
    opacity: 1;
  }
  90% {
    left: 86%;
    top: 89%;
    opacity: 1;
  }
  98%, 100% {
    left: 85%;
    top: 85%;
    opacity: 0;
  }
}

@keyframes biliTooltipAnim {
  0%, 36% {
    opacity: 0;
    transform: translateX(-50%) translateY(4px) scale(0.92);
  }
  40%, 68% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
  72%, 100% {
    opacity: 0;
    transform: translateX(-50%) translateY(4px) scale(0.92);
  }
}

@keyframes biliHighlightPulse {
  0%, 36% {
    color: #00aeec;
    border-bottom-color: #00aeec;
    text-shadow: none;
  }
  40%, 68% {
    color: #ffffff;
    border-bottom-color: #ffffff;
    text-shadow: 0 0 8px rgba(0, 174, 236, 0.8);
  }
  72%, 100% {
    color: #00aeec;
    border-bottom-color: #00aeec;
    text-shadow: none;
  }
}

@keyframes biliControlBtnAnim {
  0%, 78% {
    opacity: 0.7;
    color: #e5e9ef;
    transform: scale(1);
  }
  80%, 88% {
    opacity: 1;
    color: #00aeec;
    transform: scale(1.05);
  }
  90%, 100% {
    opacity: 0.7;
    color: #e5e9ef;
    transform: scale(1);
  }
}

@keyframes biliProgressAnim {
  0%, 100% { width: 19.16%; }
  50% { width: 22.45%; }
}

@keyframes biliProgressHandleAnim {
  0%, 100% { left: 19.16%; }
  50% { left: 22.45%; }
}

/* ========== 原生字幕悬停暂停演示 ========== */
.hover-demo-player {
  position: relative;
  width: 100%;
  height: 200px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  user-select: none;
}

.hover-demo-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, #0a1019 0%, #0d1a2b 50%, #060c14 100%);
  overflow: hidden;
}

.hover-demo-particle {
  position: absolute;
  border-radius: 50%;
  filter: blur(25px);
}

.hover-demo-particle.hp1 {
  width: 200px;
  height: 200px;
  top: -60px;
  right: -40px;
  background: radial-gradient(circle, rgba(0, 174, 236, 0.12) 0%, transparent 70%);
  animation: floatParticle1 18s infinite alternate;
}

.hover-demo-particle.hp2 {
  width: 160px;
  height: 160px;
  bottom: -40px;
  left: -20px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.08) 0%, transparent 70%);
  animation: floatParticle2 14s infinite alternate;
}

/* 模拟原生字幕栏 */
.hover-demo-subtitle {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(24, 25, 28, 0.87);
  border-radius: 4px;
  padding: 6px 14px;
  font-size: 13px;
  color: #e1e3e6;
  white-space: nowrap;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  z-index: 5;
  line-height: 1.5;
  max-width: 95%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hds-text {
  transition: color 0.25s ease;
}

/* 被点击的单词高亮动画 */
.hds-target {
  font-weight: 600;
  animation: hdsWordHighlight 8s infinite ease-in-out;
}

/* 暂停/播放状态徽章 */
.hover-demo-state-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.85);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  pointer-events: none;
  z-index: 10;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  opacity: 0;
}

.pause-badge {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  animation: hdsPauseBadge 8s infinite ease-in-out;
}

.play-badge {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #86efac;
  animation: hdsPlayBadge 8s infinite ease-in-out;
}

/* 模拟光标 */
.hover-demo-cursor {
  position: absolute;
  z-index: 20;
  pointer-events: none;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.35));
  transform-origin: top left;
  animation: hdsCursorMotion 8s infinite ease-in-out;
}

/* 查词气泡 */
.hover-demo-tooltip {
  position: absolute;
  bottom: 72px;
  left: 37%;
  transform: translateX(-50%);
  background: rgba(15, 20, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 8px;
  padding: 5px 10px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  opacity: 0;
  z-index: 15;
  pointer-events: none;
  text-align: center;
  animation: hdsTooltipAnim 8s infinite ease-in-out;
}

.hover-demo-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: rgba(15, 20, 30, 0.95);
}

/* ─── 动画关键帧 ─── */
/* 光标轨迹：右下角 → 字幕区域 solder 单词 → 点击停留 → 移开右下角 */
@keyframes hdsCursorMotion {
  0%, 5% {
    left: 75%;
    top: 30%;
    opacity: 0;
  }
  12% {
    left: 75%;
    top: 30%;
    opacity: 1;
  }
  28% {
    left: 36%;
    top: 76%;
    opacity: 1;
  }
  /* 停留在字幕上（查词发音） */
  65% {
    left: 36%;
    top: 76%;
    opacity: 1;
  }
  /* 移开 */
  80% {
    left: 72%;
    top: 28%;
    opacity: 1;
  }
  92% {
    left: 72%;
    top: 28%;
    opacity: 0.6;
  }
  100% {
    left: 75%;
    top: 30%;
    opacity: 0;
  }
}

/* 暂停徽章：光标进入字幕后显示 */
@keyframes hdsPauseBadge {
  0%, 25% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.85);
  }
  32%, 62% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  70%, 100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.85);
  }
}

/* 播放徽章：光标离开后显示 */
@keyframes hdsPlayBadge {
  0%, 72% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.85);
  }
  78%, 88% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  94%, 100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.85);
  }
}

/* 单词高亮动画：光标到达后变蓝，离开后淡出 */
@keyframes hdsWordHighlight {
  0%, 30% {
    color: #e1e3e6;
    text-shadow: none;
  }
  38%, 62% {
    color: #00aeec;
    text-shadow: 0 0 10px rgba(0, 174, 236, 0.5);
  }
  70%, 100% {
    color: #e1e3e6;
    text-shadow: none;
  }
}

/* 查词气泡动画：光标点击后浮现 */
@keyframes hdsTooltipAnim {
  0%, 35% {
    opacity: 0;
    transform: translateX(-50%) translateY(3px) scale(0.92);
  }
  42%, 60% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
  68%, 100% {
    opacity: 0;
    transform: translateX(-50%) translateY(3px) scale(0.92);
  }
}
</style>
