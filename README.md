<div align="center">

<img src="public/icon.svg" width="128" height="128" alt="RTTR Logo" />

# RTTR — RubyText Translator

**AI-Powered Contextual Word-Level Translation for English Reading**

*在阅读中学习，让每个不认识的词都被「听见」*

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![WXT](https://img.shields.io/badge/WXT-0.20-6C5CE7?logo=vite&logoColor=white)](https://wxt.dev/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 📖 What is RTTR?

RTTR is a browser extension that uses AI to analyze English text paragraphs in-context and annotate every meaningful word with its Chinese translation as a **Ruby (上标) overlay** — just like Japanese furigana, but for English vocabulary learning.

Unlike traditional translation tools:

| Tool | Granularity | Trigger | Personalization |
|------|-------------|---------|-----------------|
| **Immersive Translate** | Paragraph-level (full replacement) | Auto / Shortcut | ❌ |
| **Saladict** | Manual selection (one word at a time) | Click | ❌ |
| **RTTR** | **Word-level (Ruby annotation)** | **Shortcut + Click + Long Press** | **✅ Adaptive known-word filtering** |

**Core idea**: You press `Alt+T` on a paragraph → AI analyzes every word in context → unknown words get subtle Ruby annotations above them → you click to hear pronunciation → drag a word away to mark it as "known" → next time it won't be annotated.

The more you use it, the cleaner the page becomes.

---

## ✨ Features

### 🧠 AI Contextual Paragraph Translation
Press `Alt+T` on any paragraph — AI returns **context-aware** translations for every meaningful word. "novel" becomes "新颖的" (not "小说") because the AI sees the full sentence.

### 📝 Ruby Annotation Rendering
Translations appear as elegant **Ruby 上标** directly above the original text, with subtle color highlights and pointer cursor — without disrupting the page layout.

### 🎯 Click-to-Pronounce
Click any annotated word to hear its **TTS pronunciation** with a sleek speaker badge and IPA phonetic display.

### 🔁 Known Word Memory
**Drag an annotated word away** to dismiss it — the word is saved to your "known words" list and won't be annotated again on any page. Supports **cross-device sync** via `chrome.storage.sync`. Undo with `Ctrl+Z`.

### 🖱️ Long Press AI Translation
**Long press** any word (or selected text) to trigger an AI contextual translation. Includes an animated ring indicator and intelligent collocation detection.

### 📋 Selection-Based Actions
- **Auto Pronounce**: Select text → it's read aloud automatically
- **Auto Translate**: Select text → translation badge appears
- **Click on Selection**: Click previously selected text to translate/pronounce
- **Shortcut Pronounce**: Press `R` with text selected to hear it

### 🔍 Smart Contextual Collocation
When you long-press "video" in "*video game software*", the AI detects it's part of a compound and translates the full phrase "video game software (电子游戏软件)" instead of just "video (视频)".

### 🖼️ Image OCR
Right-click any image on a page → **"识别图片文字"** → Tesseract.js extracts English text → word popup with translation.

### ⚙️ Rich Options Page
Full settings panel to configure API endpoint, TTS voice/speed/volume, translation engine (Google / DeepL / Bing), interaction modes, and keyboard shortcuts.

---

## 🏗️ Architecture

```
rttr-extension/
├── entrypoints/
│   ├── content.ts              # Content script — event handling, interaction logic
│   ├── background.ts           # Service worker — API calls, known word management
│   └── options/
│       └── App.vue             # Settings page (Vue 3 SFC)
├── components/content/         # Vue 3 floating UI components (inside ShadowRoot)
│   ├── ContentApp.vue          # Root component
│   ├── TranslationBadge.vue    # Translation popup badge
│   ├── PronounceBadge.vue      # Speaker + IPA badge
│   ├── LongPressRing.vue       # Animated ring indicator
│   ├── ContextMenu.vue         # Right-click context menu
│   ├── ExplainPanel.vue        # Detailed word explanation panel
│   └── GlobalTooltip.vue       # Tooltip for dismiss/undo actions
├── utils/
│   ├── ai.ts                   # LLM API integration (OpenAI-compatible)
│   ├── translator.ts           # Multi-engine translation (Google/DeepL/Bing)
│   ├── phonetics.ts            # IPA lookup (local 170k dictionary + API fallback)
│   ├── tts.ts                  # Text-to-Speech via Web Speech API
│   ├── storage.ts              # Typed settings + known words (chrome.storage.sync)
│   ├── content-dom.ts          # DOM annotation, word wrapping, drag-to-dismiss
│   ├── content-state.ts        # Reactive UI state management (Vue-bridged)
│   ├── content-messaging.ts    # Safe messaging (handles extension context invalidation)
│   ├── content-ocr.ts          # Tesseract.js image text recognition
│   ├── messaging.ts            # Type-safe message definitions
│   └── skip-words.ts           # Basic word filter (articles, prepositions, etc.)
└── public/
    └── data/ipa-dict-en-us.json  # 170k-entry IPA dictionary (offline)
```

### Data Flow

```
User presses Alt+T on a paragraph
        ↓
Content Script extracts paragraph text
        ↓
Background: AI translates ALL meaningful words (one API call)
        ↓
Background: Filter basic words (skip-words.ts, < 1ms)
        ↓
Background: Filter known words (user's vocabulary, < 1ms)
        ↓
Background: Batch IPA lookup (local dict + API fallback)
        ↓
Content Script: Inject <ruby> annotations into DOM
        ↓
User clicks annotated word → TTS + Speaker badge
User drags word away → Dismiss (add to known words)
User presses Ctrl+Z → Undo last dismiss
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Chrome** ≥ 110 (or any Chromium-based browser)
- An **OpenAI-compatible API key** (OpenAI, Gemini, DeepSeek, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/Ousinki/rttr-extension.git
cd rttr-extension

# Install dependencies
npm install

# Build for production
npx wxt build
```

### Load into Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3/` folder

### Development Mode

```bash
# Start with hot-reload
npm run dev

# Build for Firefox
npm run build:firefox
```

---

## ⚙️ Configuration

After loading the extension, click the RTTR icon → the extension toggles on/off. Right-click the icon → **Options** to open the settings page.

### API Settings

| Setting | Description | Default |
|---------|-------------|---------|
| API Endpoint | OpenAI-compatible chat completions URL | `https://api.openai.com/v1/chat/completions` |
| API Key | Your API key | — |
| Model | LLM model name | `gpt-4o-mini` |

> **Tip**: Any OpenAI-compatible API works — OpenAI, Google Gemini, DeepSeek, Groq, local Ollama, etc.

### Interaction Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Single Click Pronounce | Click any word to hear TTS | ✅ On |
| Show IPA on Click | Display phonetic badge on click | ✅ On |
| Long Press AI Translate | Long press triggers AI contextual translation | ✅ On |
| Smart Collocation | AI detects compound phrases | ✅ On |
| Auto Pronounce | Auto-speak when text is selected | ✅ On |
| Auto Translate | Auto-translate when text is selected | ✅ On |
| Shortcut Pronounce | Press `R` to pronounce selected text | ✅ On |

### Translation Engine

Choose a secondary translation engine for single-click and selection badges:

- **Google Translate** (default)
- **DeepL**
- **Bing Translate**
- **None** (disable secondary translation)

### TTS Settings

| Setting | Range | Default |
|---------|-------|---------|
| Language | Browser voices | `en-US` |
| Speed | 0.1 – 2.0 | 0.85 |
| Volume | 0.0 – 1.0 | 1.0 |
| Voice | System voices | Auto |

---

## 🎮 Usage Guide

### Paragraph Translation (Alt+T)

1. Hover your mouse over any English paragraph
2. Press `Alt+T` (customizable)
3. Wait ~1s for AI to analyze the paragraph
4. All meaningful words get Ruby annotations

### Single Word Actions

| Action | Trigger | Result |
|--------|---------|--------|
| **Pronounce** | Click any word | 🔊 TTS + IPA badge |
| **AI Translate** | Long press (0.5s) | 📝 Contextual translation badge |
| **Dismiss** | Drag word away from original position | ❌ Added to known words |
| **Undo** | `Ctrl+Z` / `Cmd+Z` | ↩️ Restore last dismissed word |
| **Explain** | Right-click → "分析语境" | 📖 Detailed explanation panel |

### Selection Actions

| Action | Trigger | Result |
|--------|---------|--------|
| **Auto Pronounce** | Select text (mouseup) | 🔊 Speaks selected text |
| **Auto Translate** | Select text (mouseup) | 📝 Translation badge |
| **Long Press Selection** | Select text → long press inside | 📝 AI translates entire selection |
| **Shortcut Pronounce** | Select text → press `R` | 🔊 Speaks selected text |

### Image OCR

1. Right-click any image on the page
2. Click **"识别图片文字"** in the context menu
3. Tesseract.js extracts text from the image
4. Click recognized word to pronounce + translate

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Extension Framework | [WXT](https://wxt.dev/) | Cross-browser, Vite-powered, TypeScript-first |
| UI Components | Vue 3 + `<script setup>` | Reactive floating UI inside ShadowRoot |
| Style Isolation | Shadow DOM | Prevents CSS conflicts with host page |
| AI Integration | OpenAI-compatible API | Contextual paragraph translation |
| Phonetics | 170k IPA Dictionary + Free Dictionary API | Offline-first pronunciation lookup |
| TTS | Web Speech API | Browser-native text-to-speech |
| OCR | Tesseract.js | Client-side image text recognition |
| Storage | `chrome.storage.sync` | Cross-device settings & known words sync |

---

## 📦 Build

```bash
# Production build (Chrome)
npx wxt build

# Production build (Firefox)
npx wxt build -b firefox

# Create distributable ZIP
npx wxt zip
```

Build output is in `.output/chrome-mv3/` (or `.output/firefox-mv2/`).

---

## 🗺️ Roadmap

- [x] AI contextual paragraph translation with Ruby annotations
- [x] Known word memory system with drag-to-dismiss
- [x] Multi-engine secondary translation (Google / DeepL / Bing)
- [x] Long press AI translation with animated ring
- [x] Selection-based auto pronounce & translate
- [x] Image OCR word recognition
- [x] IPA phonetic display (170k offline dictionary)
- [ ] Streaming AI response (SSE) for progressive rendering
- [ ] Paragraph translation caching (avoid duplicate API calls)
- [ ] Firefox full support
- [ ] Vocabulary notebook / export

---

## 📄 License

This project is licensed under the MIT License.

---

<div align="center">

Made with ❤️ by [Ousinki](https://github.com/Ousinki)

</div>
