<div align="center">
  <img src="assets/icon.svg" alt="RTTR Logo" width="80" height="80">
  <h1>RTTR (RubyText Translator)</h1>
  <p><strong>没入型 AI 選択翻訳＆発音ツール</strong></p>
  <p>
    <a href="README.md">English</a> | 
    <a href="README.zh-CN.md">简体中文</a> | 
    <a href="README.zh-TW.md">繁體中文</a> | 
    <a href="README.ja.md"><b>日本語</b></a>
  </p>
  <p>
    <a href="https://github.com/Ousinki/rttr-extension/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
    </a>
    <img src="https://img.shields.io/badge/Vue.js-3.x-4fc08d.svg" alt="Vue">
    <img src="https://img.shields.io/badge/WXT-0.20-orange.svg" alt="WXT">
  </p>
</div>

**RTTR** は、シームレスで邪魔にならない読書体験を提供するために設計された、次世代の翻訳および英語学習拡張機能です。従来の機械翻訳と強力なAI文脈分析を組み合わせることで、よりスムーズな読書と深い語彙の理解をサポートします。

---

## ✨ 主な機能

- **📖 シームレスなルビ翻訳 (段落翻訳):** 視界を遮るポップアップはもう必要ありません！ショートカットキーを使用すると、RTTRは元の英語のレイアウトを崩すことなく、見知らぬ単語の上にふりがなのように翻訳を美しく「注入」します。
- **🧠 AI 文脈コロケーション分析:** 単語やフレーズを長押しするとAIが起動します。RTTRは前後の文脈を分析し、最も正確な意味を提供すると同時に、文法的なコロケーションや用法を解説します。
- **⚡ マルチエンジン選択翻訳:** テキストを選択するだけで即座に翻訳。Google、DeepL、Bingエンジンをシームレスに切り替え可能です。カーソルを避けるスマートでシンプルな直角UIデザインを採用。
- **🔊 インタラクティブな発音と発音記号 (TTS):** 
  - **自動 / クリック / ショートカット発音:** テキストを選択またはクリックすると、ネイティブの正確な発音が即座に再生されます（デフォルトはGoogle US English）。
  - **発音記号ポップアップ:** 単語をクリックすると、発音と同時に標準的な発音記号（IPA）をワンクリックで確認できます。
- **🔐 APIキーの持ち込み (BYOK):** プライバシーとコントロールを重視。OpenAI互換のAPIキーを独自に設定し、AI翻訳の機能を完全に管理できます。

## 🚀 インストールとビルド

RTTR は [WXT](https://wxt.dev/) と Vue 3 で構築されています。

### 1. ソースからビルドする

1. このリポジトリをクローンします:
   ```bash
   git clone https://github.com/Ousinki/rttr-extension.git
   cd rttr-extension
   ```
2. 依存関係をインストールします:
   ```bash
   npm install
   ```
3. 拡張機能をビルドします:
   ```bash
   npm run build
   ```
4. コンパイルされた拡張機能のファイルは `.output/chrome-mv3` ディレクトリに生成されます。

### 2. Chrome ブラウザに読み込む

1. Chromeを開き、`chrome://extensions/` にアクセスします。
2. 右上の **デベロッパー モード** をオンにします。
3. **パッケージ化されていない拡張機能を読み込む** をクリックし、生成された `.output/chrome-mv3` ディレクトリを選択します。

## ⚙️ 拡張機能の設定

RTTR 拡張機能のアイコンをクリックして **詳細設定ページ** を開きます。設定ページでは以下のことが可能です：
- OpenAI互換のAPIキー、APIエンドポイント、モデルを入力。
- 好みの機械翻訳エンジン (Google / DeepL / Bing) を選択。
- TTS (Text-to-Speech) の話者、音量、速度を設定。
- 各種翻訳や発音のトリガーモード（クリック、選択時自動、長押しなど）をオン/オフ。

## 🤝 謝辞

[MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator) オープンソースプロジェクトに特別な感謝を捧げます。マルチエンジンAPI (Google, DeepL, Bing) のリクエスト処理および制限回避の基礎ロジックにおいて、このプロジェクトから大きなインスピレーションを受け、優れたコード実装を参考にさせていただきました。

## 📜 ライセンス

このプロジェクトは [MIT License](LICENSE) の下でオープンソース化されています。
