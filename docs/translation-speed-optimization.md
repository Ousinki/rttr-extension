# RTTR 翻译速度优化技术文档

> **项目**: RTTR (RubyText Translator) 浏览器扩展
> **版本**: v0.1 (初始版)
> **日期**: 2026-05-01
> **参考**: 沉浸式翻译 (Immersive Translate) 架构分析

---

## 目录

1. [概述](#1-概述)
2. [翻译引擎分层架构](#2-翻译引擎分层架构)
3. [六大速度优化策略](#3-六大速度优化策略)
4. [RTTR 专属优化方案](#4-rttr-专属优化方案)
5. [性能指标与目标](#5-性能指标与目标)
6. [技术实现参考](#6-技术实现参考)

---

## 1. 概述

### 1.1 背景

通过对沉浸式翻译等主流翻译插件的深度研究发现，用户感知到的"闪电般速度"并非来自翻译模型本身的推理速度，而是来自**精心的工程优化**。具体来说，速度优势源于以下 6 大核心策略的协同配合：

- 并发分段请求
- 流式输出 (SSE)
- 智能缓存
- 传统 API 优先
- 可视区域优先渲染
- 乐观 UI 渲染

### 1.2 RTTR 与沉浸式翻译的差异

| 维度 | 沉浸式翻译 | RTTR |
|------|-----------|------|
| **翻译粒度** | 段落/句子级 | **单词级**（Ruby 注音） |
| **输出形式** | 双语对照段落 | `<ruby>` + `<rt>` 行内标签 |
| **网络依赖** | 高（每次都需要 API） | **低**（大量单词可纯本地查询） |
| **DOM 修改量** | 追加段落节点 | 替换文本节点为 Ruby 节点 |
| **可逆性要求** | 删除追加的节点 | 还原原始文本节点 |

> **核心结论**: RTTR 的单词级粒度使得本地词典查询可以覆盖 90%+ 的常见单词，理论上可以比沉浸式翻译更快。

---

## 2. 翻译引擎分层架构

### 2.1 引擎分类

翻译插件的引擎通常分为两大类：

#### 传统翻译 API（速度极快，< 200ms）

| 引擎 | 响应时间 | 特点 | 适用场景 |
|------|---------|------|---------|
| **Google 翻译** | 50~150ms | 免费、速度快、覆盖面广 | 默认引擎 |
| **DeepL** | 100~300ms | 翻译质量最高 | 高质量需求 |
| **微软翻译 (Azure)** | 80~200ms | 稳定、免费额度大 | 备选 |
| **百度翻译** | 100~250ms | 中文优化好 | 中文场景 |
| **火山翻译 (字节)** | 80~200ms | 速度快、免费额度大 | 高并发场景 |
| **腾讯翻译** | 100~250ms | 中文场景优化 | 备选 |

#### AI 大模型翻译（质量更高，1~5 秒）

| 引擎 | 响应时间 | 特点 | 适用场景 |
|------|---------|------|---------|
| **OpenAI (GPT-4o)** | 1~3s | 翻译质量极高，上下文理解 | 高质量 / 上下文翻译 |
| **DeepSeek** | 1~2s | 国产性价比之王 | 日常高质量翻译 |
| **Gemini** | 1~3s | 免费额度大 | 免费用户 |
| **Claude** | 2~4s | 文学性翻译出色 | 文学 / 学术内容 |
| **Groq** | 0.3~1s | 硬件加速，推理极快 | 追求 AI 品质但要求低延迟 |
| **Ollama** | 1~10s | 本地部署，无网络依赖 | 隐私敏感 / 离线场景 |

### 2.2 RTTR 引擎优先级策略（四级降级）

RTTR 的翻译粒度为单词级别，因此采用以下降级策略：

```
Level 0: 本地离线词典 (ECDICT JSON)
   ↓ 未命中
Level 1: 本地 AI 模型 (Ollama / Kokoro)
   ↓ 不可用
Level 2: 传统翻译 API (Google / DeepL)
   ↓ 超时或失败
Level 3: AI 大模型 API (GPT / DeepSeek)
```

**关键点**: Level 0 的本地词典可覆盖 ~90% 的常见英文单词，几乎零延迟（< 5ms）。

---

## 3. 六大速度优化策略

### 3.1 并发分段请求 (Parallel Chunked Requests)

**原理**: 不把整页文本发给一个 API 等返回，而是拆分成多个小块并发请求。

```
❌ 传统做法：
[================== 等待整页翻译 ==================] → 3 秒后一次性显示

✅ 沉浸式做法：
[==] [==] [==] [==] [==] [==] [==] [==]
 ↓    ↓    ↓    ↓    ↓    ↓    ↓    ↓
 50ms 80ms 60ms 90ms 70ms 55ms 85ms 75ms → 最长的一个 90ms 后全部到位
```

**RTTR 实现方案**:

```typescript
// 按 DOM 区块（div/p/section）并发发送单词列表
async function translatePage(textNodes: TextNode[]) {
  // 1. 按父容器分组
  const chunks = groupByParentElement(textNodes, { maxChunkSize: 50 });

  // 2. 并发请求，限制最大并发数
  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      translateChunk(chunk, { concurrency: 10, timeout: 3000 })
    )
  );

  // 3. 哪个先返回就先渲染哪个
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      renderRubyAnnotations(chunks[index], result.value);
    }
  });
}
```

**关键参数**:
- `maxChunkSize`: 每个请求包含的最大单词数（推荐 30~50）
- `concurrency`: 最大并发请求数（推荐 8~15，防止触发 API 限流）
- `timeout`: 单个请求超时时间（推荐 3000ms）

---

### 3.2 流式输出 (Streaming / SSE)

**原理**: 对于 AI 大模型引擎，使用 Server-Sent Events 流式传输，翻译结果"一边生成一边显示"。

```
❌ 传统做法（等待完成）：
[等待...等待...等待...] → 3 秒后完整结果

✅ 流式做法（逐步显示）：
[翻] → [翻译] → [翻译结] → [翻译结果] → 用户全程无空白感知
```

**RTTR 实现方案**:

```typescript
async function streamTranslate(
  text: string,
  onToken: (partial: string) => void
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, stream: true }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    // 解析 SSE 格式: data: {...}\n\n
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const data = JSON.parse(line.slice(6));
      onToken(data.content);
    }
  }
}
```

**适用场景**: 仅在用户选择 AI 大模型引擎（GPT / DeepSeek / Gemini）时启用。传统 API 响应本身就足够快，无需流式。

---

### 3.3 智能缓存 (Translation Cache)

**原理**: 翻译过的内容缓存到本地，重复内容命中缓存时零延迟。

**三级缓存架构**:

```
L1 缓存: 内存 Map     → 当前页面会话内，查询 < 0.01ms
L2 缓存: IndexedDB    → 跨页面持久化，查询 < 1ms
L3 缓存: chrome.storage.local → 跨浏览器会话，查询 < 5ms
```

**RTTR 实现方案**:

```typescript
class TranslationCache {
  private memoryCache = new Map<string, CacheEntry>(); // L1
  private db: IDBDatabase; // L2

  async get(word: string): Promise<CacheEntry | null> {
    // L1: 内存缓存（最快）
    if (this.memoryCache.has(word)) {
      return this.memoryCache.get(word)!;
    }

    // L2: IndexedDB（跨页面持久化）
    const stored = await this.getFromDB(word);
    if (stored) {
      this.memoryCache.set(word, stored); // 回填 L1
      return stored;
    }

    return null; // 未命中，需要查询翻译引擎
  }

  async set(word: string, entry: CacheEntry): Promise<void> {
    this.memoryCache.set(word, entry); // 写入 L1
    await this.saveToDB(word, entry); // 异步写入 L2
  }
}

interface CacheEntry {
  word: string;
  translation: string;
  phonetic?: string; // IPA 音标
  source: "local" | "api" | "ai"; // 翻译来源
  timestamp: number;
  ttl: number; // 缓存过期时间
}
```

**缓存策略**:
- 本地词典命中：`ttl = Infinity`（永不过期）
- 传统 API 结果：`ttl = 7 天`
- AI 模型结果：`ttl = 30 天`（质量更高，缓存更久）
- 缓存上限：10,000 条，采用 LRU 淘汰策略

---

### 3.4 传统 API 优先 (Traditional API First)

**原理**: 默认使用响应速度最快的引擎，而非质量最高但延迟大的 AI 引擎。

**沉浸式翻译的做法**:
- 默认引擎：Google 翻译（50~150ms）
- 用户可手动切换为 DeepL / GPT 等

**RTTR 的特殊优势**:
- RTTR 的翻译粒度是**单词级**，而非段落级
- 英文常用词（3000~5000 词）覆盖日常文本 90%+
- 因此 RTTR 可以将**本地词典**作为"默认引擎"，完全跳过网络请求

```typescript
async function resolveWord(word: string): Promise<WordResult> {
  // 1. 查缓存（< 0.01ms）
  const cached = await cache.get(word);
  if (cached) return cached;

  // 2. 查本地词典（< 5ms）
  const local = localDict.lookup(word);
  if (local) {
    await cache.set(word, local);
    return local;
  }

  // 3. 降级到在线 API（50~300ms）
  const online = await onlineTranslate(word);
  await cache.set(word, online);
  return online;
}
```

---

### 3.5 可视区域优先渲染 (Viewport-First Rendering)

**原理**: 只处理用户当前看到的内容，屏幕外的内容在用户滚动到时再处理。

```
┌──────────────────────────┐
│     已翻译（滚过的）       │  ← 之前翻译过，已有缓存
├──────────────────────────┤
│                          │
│   ★ 当前可视区域 ★        │  ← 最高优先级，立即翻译
│   (Viewport)             │
│                          │
├──────────────────────────┤
│     预加载区域             │  ← 提前 1 屏高度预翻译
├──────────────────────────┤
│     未翻译（远处的）       │  ← 等用户滚动到时再处理
└──────────────────────────┘
```

**RTTR 实现方案**:

```typescript
class ViewportTranslator {
  private observer: IntersectionObserver;
  private translated = new WeakSet<Element>();

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !this.translated.has(entry.target)) {
            this.translated.add(entry.target);
            this.translateElement(entry.target as HTMLElement);
          }
        }
      },
      {
        // 提前 1 个屏幕高度开始预加载
        rootMargin: "100% 0px 100% 0px",
      }
    );
  }

  observe(container: HTMLElement) {
    // 观察所有段落级元素
    const blocks = container.querySelectorAll("p, li, td, h1, h2, h3, h4, h5, h6, span, div");
    blocks.forEach((block) => this.observer.observe(block));
  }

  private async translateElement(el: HTMLElement) {
    const textNodes = extractTextNodes(el);
    const words = tokenize(textNodes);
    const results = await batchResolveWords(words);
    injectRubyAnnotations(textNodes, results);
  }
}
```

**性能收益**:
- 一篇 5000 词的长文章，如果可视区域只有 200 词
- 首次渲染只需处理 200 词（4% 的工作量），**延迟降低 25 倍**
- 剩余内容在用户滚动时逐步处理，用户几乎无感知

---

### 3.6 乐观 UI 渲染 (Optimistic Rendering)

**原理**: 在翻译结果返回之前，先用占位符预占空间，避免翻译到达后的页面跳动。

**RTTR 实现方案**:

```typescript
function injectPlaceholder(textNode: Text, word: string): HTMLElement {
  const ruby = document.createElement("ruby");
  ruby.textContent = word;

  const rt = document.createElement("rt");
  rt.className = "rttr-loading"; // 半透明加载态
  rt.textContent = "···"; // 占位符
  ruby.appendChild(rt);

  textNode.parentNode!.replaceChild(ruby, textNode);
  return ruby;
}

function updateWithResult(ruby: HTMLElement, result: WordResult) {
  const rt = ruby.querySelector("rt")!;
  rt.textContent = result.translation;
  rt.className = "rttr-ready"; // 切换到正常态
  // 可以加一个微动画: fade-in 过渡
}
```

**CSS 配合**:

```css
.rttr-loading {
  opacity: 0.3;
  font-size: 0.6em;
  transition: opacity 0.2s ease;
}

.rttr-ready {
  opacity: 1;
  font-size: 0.6em;
  transition: opacity 0.2s ease;
}
```

---

## 4. RTTR 专属优化方案

### 4.1 本地词典预加载

RTTR 的最大速度优势在于**本地词典**。基于 Anysome 项目积累的 ECDICT 词典（~270 万条目），RTTR 可以做到：

```
常见 3000 词 → 覆盖日常文本 85%+
常见 8000 词 → 覆盖日常文本 95%+
ECDICT 全量  → 覆盖 99%+ 的英文单词
```

**优化策略**:
- 启动时预加载高频 3000 词的精简词典到内存（约 200KB）
- 完整词典保存在 IndexedDB 中按需查询
- 只有完全未知的生僻词/专业术语才走网络 API

### 4.2 批量词汇去重

一个网页中大量单词是重复出现的（如 "the", "is", "and" 等虚词，以及段落间重复的关键词）。

```typescript
function deduplicateWords(words: string[]): Map<string, number[]> {
  // 返回: { word → [出现位置索引列表] }
  const map = new Map<string, number[]>();
  words.forEach((word, index) => {
    const normalized = word.toLowerCase();
    if (!map.has(normalized)) {
      map.set(normalized, []);
    }
    map.get(normalized)!.push(index);
  });
  return map;
}

// 一个 5000 词的页面，去重后可能只需查询 800 个唯一单词
// 翻译工作量减少 84%
```

### 4.3 虚词/已知词过滤

对于用户已经掌握的词汇，直接跳过，不做注音：

```typescript
const SKIP_WORDS = new Set([
  // 英语虚词（冠词、介词、连词等）
  "the", "a", "an", "is", "are", "was", "were",
  "in", "on", "at", "to", "for", "of", "with",
  "and", "or", "but", "not", "no", "yes",
  "i", "you", "he", "she", "it", "we", "they",
  // ... 约 200 个虚词
]);

// 用户自定义的"已掌握词汇"列表
const userMasteredWords: Set<string> = loadFromStorage("mastered_words");

function shouldAnnotate(word: string): boolean {
  const lower = word.toLowerCase();
  if (SKIP_WORDS.has(lower)) return false;
  if (userMasteredWords.has(lower)) return false;
  return true;
}
```

### 4.4 DOM 操作批量化 (Batch DOM Writes)

防止逐个 Ruby 节点插入导致的布局抖动（Layout Thrashing）：

```typescript
async function batchInjectRuby(
  textNodes: Text[],
  results: Map<string, WordResult>
) {
  // 1. 先构建所有 DocumentFragment（纯内存操作，不触发重排）
  const fragments: Array<{ node: Text; fragment: DocumentFragment }> = [];

  for (const textNode of textNodes) {
    const fragment = buildRubyFragment(textNode, results);
    fragments.push({ node: textNode, fragment });
  }

  // 2. 使用 requestAnimationFrame 批量写入 DOM（单次重排）
  requestAnimationFrame(() => {
    for (const { node, fragment } of fragments) {
      node.parentNode!.replaceChild(fragment, node);
    }
  });
}
```

---

## 5. 性能指标与目标

### 5.1 核心性能 KPI

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **首屏注音时间 (FRT)** | < 200ms | 可视区域内所有词完成注音 |
| **本地词典查询延迟** | < 5ms / 词 | 单词在内存词典中的查询时间 |
| **在线 API 延迟** | < 500ms / 批 | 一批未知词的网络查询时间 |
| **内存占用增量** | < 30MB | 扩展运行后的额外内存开销 |
| **DOM 重排次数** | ≤ 3 次 | 一次完整页面注音的布局重排次数 |
| **FPS 影响** | > 55fps | 注音过程中页面滚动帧率不低于 55fps |

### 5.2 场景基准测试

| 测试场景 | 预期耗时 |
|---------|---------|
| 短文（500 词，如新闻摘要） | < 100ms |
| 中文（2000 词，如博客文章） | < 300ms |
| 长文（5000 词，如学术论文） | < 800ms |
| 超长文（10000+ 词，如小说章节） | < 1500ms（配合懒加载） |

---

## 6. 技术实现参考

### 6.1 整体架构流程图

```
用户按下快捷键
       │
       ▼
┌──────────────────┐
│  DOM 预解析引擎   │ ← TreeWalker 提取所有 TextNode
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  分词 + 去重      │ ← tokenize → deduplicate → filter
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌─────────────────┐
│  缓存查询 (L1/L2) │────→│ 命中 → 直接渲染   │
└────────┬─────────┘     └─────────────────┘
         │ 未命中
         ▼
┌──────────────────┐     ┌─────────────────┐
│  本地词典 (ECDICT) │────→│ 命中 → 写缓存+渲染 │
└────────┬─────────┘     └─────────────────┘
         │ 未命中
         ▼
┌──────────────────┐     ┌─────────────────┐
│  在线 API (批量)   │────→│ 返回 → 写缓存+渲染 │
└──────────────────┘     └─────────────────┘
```

### 6.2 与 Anysome Translator 的技术继承

RTTR 项目可以直接继承和复用 Anysome Translator 的以下组件：

| 组件 | Anysome 中的实现 | RTTR 中的用途 |
|------|-----------------|-------------|
| **ECDICT 本地词典** | ~270 万条目，最长匹配优先 | 单词级 Ruby 注音的主力查询引擎 |
| **DeepL JSON-RPC** | 自定义 Rust 实现，绕过限流 | 生僻词降级查询 |
| **Edge TTS** | Cloud 级音频合成 | 单词悬浮发音 |
| **Kokoro WASM** | 浏览器内神经合成 | 离线 TTS |
| **LLM Prompt 策略** | 已掌握词汇过滤 | 个性化注音过滤 |

### 6.3 推荐技术栈

| 层面 | 技术选型 | 理由 |
|------|---------|------|
| **框架** | WXT | 现代化扩展框架，支持 Vue/React，多浏览器兼容 |
| **UI 框架** | Vue 3 + TypeScript | 与 Anysome 保持一致，双向绑定适合配置页 |
| **Content Script** | Vanilla JS + DOM API | 注入层不引入框架，保证极致性能 |
| **样式隔离** | Shadow DOM | 防止 CSS 污染宿主页面 |
| **本地存储** | IndexedDB + chrome.storage | 词典用 IndexedDB，配置用 storage |
| **构建工具** | Vite (WXT 内置) | 极速 HMR 开发体验 |
| **代码规范** | ESLint + TypeScript Strict | WXT Skill 规范（45 条规则） |

---

## 附录

### A. 沉浸式翻译支持的全部翻译引擎列表

**传统翻译 API:**
DeepL · Google 翻译 · 微软翻译 (Azure) · 百度翻译 · 腾讯翻译 · 火山翻译 (字节) · 彩云小译 · 小牛翻译 · 有道翻译 · 有道子曰 · 阿里云翻译 · OpenL

**AI 大模型:**
OpenAI (GPT) · DeepSeek · Gemini · Claude · Grok · Groq · Kimi · 通义千问 (Qwen-MT) · 豆包 (火山方舟) · 腾讯混元 · 智谱 GLM · 零一万物 · Ollama (本地) · Azure OpenAI · OpenRouter · 阿里云百炼

**专用翻译模型:**
Qwen-MT（通义千问专用翻译模型，区别于通用 LLM）

### B. 参考资料

- [沉浸式翻译官方文档](https://immersivetranslate.com/docs/)
- [WXT 框架文档](https://wxt.dev/)
- [ECDICT 开源词典](https://github.com/skywind3000/ECDICT)
- [Anysome Translator 项目](../../../anysome-translator/) (内部参考)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
