<div align="center">
  <img src="assets/icon.svg" alt="RTTR Logo" width="80" height="80">
  <h1>RTTR (RubyText Translator)</h1>
  <p><strong>沉浸式 AI 划词翻译与发音工具</strong></p>
  <p>
    <a href="README.md">English</a> | 
    <a href="README.zh-CN.md"><b>简体中文</b></a> | 
    <a href="README.zh-TW.md">繁體中文</a> | 
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

**RTTR** 是一款为打造沉浸式、无干扰阅读体验而生的次世代翻译与英语学习插件。它将传统机器翻译与强大的 AI 语境分析相结合，帮助您更流畅地阅读并深入理解词汇。

---

## ✨ 核心功能

- **📖 沉浸式段落无缝注音 (Ruby):** 告别遮挡视线的弹窗！使用快捷键，RTTR 可以在不破坏原有英文版面的前提下，将中文翻译像拼音一样优雅地“注入”到生词上方。
- **🧠 AI 语境搭配分析:** 长按任何单词或短语即可召唤 AI。RTTR 会结合上下文语境为您提供最精准的释义，并拆解其语法搭配和用法。
- **⚡ 多引擎划词翻译:** 选中文本即刻翻译，支持无缝切换 Google、DeepL 或 Bing 引擎。采用极致简约的直角 UI 设计，智能避让光标。
- **🔊 互动式发音与音标 (TTS):** 
  - **自动 / 点击 / 快捷键发音:** 选中或点击单词，即刻播放纯正母语发音（默认选用 Google 美式英语）。
  - **音标悬浮窗:** 单击单词，在发音的同时即可一键查看标准音标。
- **🔐 自带密钥 (BYOK):** 隐私至上。您可以自行配置兼容 OpenAI 格式的 API Key，完全掌控 AI 翻译引擎。

## 🚀 安装与构建

RTTR 基于 [WXT](https://wxt.dev/) 和 Vue 3 开发。

### 1. 本地构建

1. 克隆本仓库:
   ```bash
   git clone https://github.com/Ousinki/rttr-extension.git
   cd rttr-extension
   ```
2. 安装依赖:
   ```bash
   npm install
   ```
3. 构建插件:
   ```bash
   npm run build
   ```
4. 编译后的插件代码将生成在 `.output/chrome-mv3` 目录中。

### 2. 载入 Chrome 浏览器

1. 打开 Chrome 并访问 `chrome://extensions/`。
2. 在右上角开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，并选择刚才生成的 `.output/chrome-mv3` 目录。

## ⚙️ 插件配置

点击 RTTR 插件图标打开 **高级设置页面**。在设置页面中，您可以：
- 填入兼容 OpenAI 格式的 API Key、API 端点及模型。
- 选择您偏好的常规机器翻译引擎 (Google / DeepL / Bing)。
- 配置 TTS 语音合成的发音人、音量及语速。
- 开启或关闭各种翻译与发音触发模式（例如：单击、选中自动触发、长按等）。

## 🤝 鸣谢

特别感谢 [MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator) 开源项目。我们在处理多引擎 API (Google, DeepL, Bing) 的请求与防限流底层逻辑上，深受该项目的启发并参考了其优秀的代码实现。

## 📜 开源协议

本项目基于 [MIT 协议](LICENSE) 开源。
