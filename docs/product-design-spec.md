# RTTR 产品设计与技术规格文档

> **项目**: RTTR (RubyText Translator) 浏览器扩展
> **版本**: v0.1
> **日期**: 2026-05-01
> **来源**: 产品讨论记录整理

---

## 1. 产品定位

RTTR 是一款**语境级单词注音翻译**浏览器扩展，区别于市面上现有的翻译插件：

| 产品 | 翻译粒度 | 触发方式 | 个性化 |
|------|---------|---------|--------|
| **沉浸式翻译** | 段落级（整段替换） | 自动/快捷键 | 无 |
| **沙拉查词** | 手动划词（单次查一个词） | 手动划词 | 无 |
| **RTTR** | **单词级（语境 Ruby 注音）** | **快捷键触发段落分析** | **✅ 自适应已知词过滤** |

**核心差异**: RTTR 不做整段翻译，而是对段落中的**每个实义词**进行语境翻译并以 Ruby 上标标注，同时通过用户交互不断学习用户的词汇水平。

---

## 2. 核心功能

### 功能一：AI 语境段落注音翻译

**用户操作流程**：

```
1. 鼠标悬浮在一段英文文本上
2. 按下快捷键（如 Alt+T）
3. 插件识别鼠标所在的段落（<p>、<div> 等块级元素）
4. 整段文本发送给 AI 进行语境分析
5. AI 返回所有实义词的语境翻译
6. 前端本地过滤掉用户已掌握的词汇
7. 剩余词汇注入 <ruby> + <rt> 上标标注 + 字体着色
8. Hover 标注词 → 光标变为手型（cursor: pointer）
9. Click 标注词 → TTS 发音
```

**页面效果示例**：

```
翻译前：
  The scientist addressed the fundamental hypothesis with a novel approach.

翻译后（新用户，全部标注）：
  The scientist(科学家) addressed(探讨) the fundamental(根本的)
  hypothesis(假设) with a novel(新颖的) approach(方法).

翻译后（老用户，已掌握 scientist/fundamental/approach）：
  The scientist addressed(探讨) the fundamental
  hypothesis(假设) with a novel(新颖的) approach.
```

**关键特性**：
- 标注的单词原文和上标均添加**字体颜色**（可配置）
- 只有被标注的单词才响应鼠标交互（Hover 手型、Click 发音）
- 未标注的单词保持页面原始样式，不受影响

### 功能二：个性化已知词记忆系统

**核心理念**：不使用本地词典预设过滤，而是通过用户的操作行为，逐步学习用户的词汇水平。

**交互方式**：

```
AI 标注完成后，用户看到所有实义词都被标注：
  The scientist(科学家) addressed(探讨) the fundamental(根本的) ...

用户点击 "scientist" 的标注 → 取消标注（表示"我认识这个词"）
用户点击 "fundamental" 的标注 → 取消标注

结果：scientist 和 fundamental 被加入"已掌握词表"
下次翻译任何段落时，这两个词都不会再被标注
```

**数据结构**：

```typescript
interface KnownWord {
  word: string;          // 单词原形（lemma）
  dismissedAt: number;   // 标记时间戳
  dismissCount: number;  // 累计被取消次数（越多越确认掌握）
}
```

**存储方案**：
- 使用 `chrome.storage.sync` 存储 → 可跨设备同步
- 用户在电脑上标记的已知词，手机端自动生效

---

## 3. 核心技术决策

### 3.1 AI 调用策略：一次调用 + 前端后过滤

**问题**: 随着用户掌握的词越来越多（可能达数千个），如何避免已知词表撑爆 Prompt？

**解决方案**: AI 不需要知道用户的已知词表。

```
✅ 正确流程（一次 AI 调用）：

  用户按快捷键
      ↓
  整段原文发给 AI（一次调用，标注所有实义词 + 语境翻译）
      ↓ ~0.5~1.5s
  AI 返回全量结果：[{word, translation}, {word, translation}, ...]
      ↓
  前端本地过滤掉已知词（纯 JS 比较，< 1ms）
      ↓
  只渲染未被过滤的标注
```

**为什么不能先过滤再发 AI？** 因为 AI 必须看到**完整段落**才能做语境翻译：

```
❌ 把 "novel" 单独发给 AI → 可能翻译为"小说"
✅ 把整段发给 AI → AI 看到上下文，翻译为"新颖的"
```

**为什么不把已知词表塞进 Prompt？**

| 方案 | Prompt 大小 | Token 成本 | 准确度 |
|------|------------|-----------|--------|
| 全塞 Prompt | 随词量线性增长 | 不可控 | LLM 可能遗漏 |
| **前端后过滤** | **恒定不变** | **最低且稳定** | **100% 精确** |

### 3.2 AI Prompt 设计

```
将以下英文段落中的每个实义词和短语，根据当前语境翻译为中文。
跳过冠词(a/an/the)、介词(in/on/at/to)、连词(and/or/but)、
代词(I/you/he/she/it/they)等基础虚词。
其余所有词汇都必须标注。

以 JSON 数组返回：[{"word":"原文", "translation":"语境翻译"}]

段落：{paragraph_text}
```

**Prompt 设计原则**：
- AI 标注**所有实义词**，不替用户判断哪些词"有学习价值"
- AI 只负责"全量翻译"，用户负责"个性化裁剪"
- Prompt 内容恒定，不随用户词汇量变化

### 3.3 前端过滤实现

```typescript
function filterKnownWords(
  aiResults: AnnotationResult[],
  knownWords: Set<string>
): AnnotationResult[] {
  return aiResults.filter(
    (item) => !knownWords.has(item.word.toLowerCase())
  );
}
// 执行时间 < 1ms，即使已知词表有 10000 个词
```

---

## 4. 技术栈选型

| 层面 | 选型 | 理由 |
|------|-----|------|
| **扩展框架** | WXT | 现代化、支持多浏览器、内置 Vite |
| **UI 框架** | Vue 3 + TypeScript | 与 Anysome 经验一致 |
| **Content Script** | Vanilla JS + DOM API | 注入层不引入框架，极致性能 |
| **样式隔离** | Shadow DOM | 防止 CSS 污染宿主页面 |
| **存储** | chrome.storage.sync | 已知词表跨设备同步 |
| **AI 规范** | wxt-browser-extensions Skill（45 条规则） | 本地 AI 技能包 |

---

## 5. 与 Anysome Translator 的关系

RTTR 定位为 Anysome 的"精简专注版"，可复用以下组件：

| 组件 | 复用方式 |
|------|---------|
| LLM Prompt 策略 | 改造为"全量实义词标注"模式 |
| Ruby 注音渲染 | 直接复用 |
| 可配置颜色系统 | 直接复用 |
| TTS 多引擎（Edge/Kokoro/Azure） | 直接复用 |
| 快捷键触发机制 | 直接复用 |

**砍掉的部分**：Tauri 桌面端、侧边栏 UI、本地词典（ECDICT）。

---

## 6. 马具工程 (Harness Engineering) 应用

基于《程序员鱼皮》的 Harness 指南，RTTR 在开发中应用 5 大模块：

| 模块 | RTTR 实践 |
|------|----------|
| **上下文架构** | 项目根目录 `AGENTS.md`，明确 WXT + MV3 + Vue 3 技术栈规则 |
| **执行能力** | Shell 初始化项目、Browser Subagent 视觉测试 |
| **任务编排** | Plan Mode 分阶段开发（脚手架 → 翻译 → UI → 个性化） |
| **反馈机制** | ESLint + TypeScript Strict + 浏览器截图对比 |
| **架构护栏** | Shadow DOM 隔离、DOM 修改可逆、requestAnimationFrame 性能保障 |

---

## 7. 速度优化策略

详见 [translation-speed-optimization.md](./translation-speed-optimization.md)，核心策略：

1. **一次 AI 调用**：标注 + 翻译合为一次请求
2. **前端后过滤**：已知词过滤在本地完成，< 1ms
3. **流式输出 (SSE)**：AI 结果逐步返回，逐步渲染
4. **可视区域优先**：IntersectionObserver 只处理可见段落
5. **智能缓存**：同一段落的翻译结果缓存到 IndexedDB
6. **乐观 UI**：翻译中显示加载占位符，翻译完成后平滑替换

---

## 附录：产品功能正向循环

```
┌───────────────────────────────────────────┐
│                                           │
│  功能 1: AI 全量语境翻译 + Ruby 上标标注     │
│  （标注所有实义词，着色 + 手型光标 + TTS）    │
│                                           │
│              ↓ 用户点击取消标注              │
│                                           │
│  功能 2: 已知词记忆系统                     │
│  （记录用户掌握的词，下次自动跳过）           │
│                                           │
│              ↓ 反馈给下次翻译               │
│                                           │
│  效果: 越用标注越少 → 阅读越干净 → 越爱用    │
│                                           │
└───────────────────────────────────────────┘
```
