<div align="center">
  <img src="assets/icon.svg" alt="RTTR Logo" width="80" height="80">
  <h1>RTTR (RubyText Translator)</h1>
  <p><strong>沉浸式 AI 劃詞翻譯與發音工具</strong></p>
  <p>
    <a href="README.md">English</a> | 
    <a href="README.zh-CN.md">简体中文</a> | 
    <a href="README.zh-TW.md"><b>繁體中文</b></a> | 
    <a href="README.ja.md">日本語</a>
  </p>
  <p>
    <a href="https://github.com/Ousinki/rttr-extension/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
    </a>
    <img src="https://img.shields.io/badge/Vue.js-3.x-4fc08d.svg" alt="Vue">
    <img src="https://img.shields.io/badge/WXT-0.20-orange.svg" alt="WXT">
  </p>
</div>

**RTTR** 是一款為打造沉浸式、無干擾閱讀體驗而生的次世代翻譯與英語學習擴充功能。它將傳統機器翻譯與強大的 AI 語境分析相結合，幫助您更流暢地閱讀並深入理解詞彙。

---

## ✨ 核心功能

- **📖 沉浸式段落無縫注音 (Ruby):** 告別遮擋視線的彈窗！使用快捷鍵，RTTR 可以在不破壞原有英文版面的前提下，將翻譯像拼音一樣優雅地「注入」到生詞上方。
- **🧠 AI 語境搭配分析:** 長按任何單字或短語即可召喚 AI。RTTR 會結合上下文語境為您提供最精準的釋義，並拆解其語法搭配和用法。
- **⚡ 多引擎劃詞翻譯:** 選取文字即刻翻譯，支援無縫切換 Google、DeepL 或 Bing 引擎。採用極致簡約的直角 UI 設計，智慧避讓游標。
- **🔊 互動式發音與音標 (TTS):** 
  - **自動 / 點擊 / 快捷鍵發音:** 選取或點擊單字，即刻播放純正母語發音（預設選用 Google 美式英語）。
  - **音標懸浮窗:** 單擊單字，在發音的同時即可一鍵查看標準音標。
- **🔐 自帶金鑰 (BYOK):** 隱私至上。您可以自行設定相容 OpenAI 格式的 API Key，完全掌控 AI 翻譯引擎。

## 🚀 安裝與建置

RTTR 基於 [WXT](https://wxt.dev/) 和 Vue 3 開發。

### 1. 本地建置

1. 複製本儲存庫:
   ```bash
   git clone https://github.com/Ousinki/rttr-extension.git
   cd rttr-extension
   ```
2. 安裝套件:
   ```bash
   npm install
   ```
3. 建置擴充功能:
   ```bash
   npm run build
   ```
4. 編譯後的擴充功能檔案將產生於 `.output/chrome-mv3` 目錄中。

### 2. 載入 Chrome 瀏覽器

1. 開啟 Chrome 並前往 `chrome://extensions/`。
2. 在右上角開啟 **開發人員模式**。
3. 點擊 **載入未封裝項目**，並選擇剛才產生的 `.output/chrome-mv3` 目錄。

## ⚙️ 擴充功能設定

點擊 RTTR 擴充功能圖示開啟 **進階設定頁面**。在設定頁面中，您可以：
- 填入相容 OpenAI 格式的 API Key、API 端點及模型。
- 選擇您偏好的常規機器翻譯引擎 (Google / DeepL / Bing)。
- 設定 TTS 語音合成的發音人、音量及語速。
- 開啟或關閉各種翻譯與發音觸發模式（例如：點擊、選取自動觸發、長按等）。

## 🤝 鳴謝

特別感謝 [MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator) 開源專案。我們在處理多引擎 API (Google, DeepL, Bing) 的請求與防限流底層邏輯上，深受該專案的啟發並參考了其優秀的程式碼實作。

## 📜 開源協議

本專案基於 [MIT 協議](LICENSE) 開源。
