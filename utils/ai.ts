/**
 * RTTR AI Translation Module
 * 封装 LLM API 调用，支持 OpenAI 兼容接口
 */

import type { RTTRSettings } from './storage';

// ─── 类型定义 ────────────────────────────────────────────

export interface AnnotationResult {
  text: string;
  word: string;
  start: number;
  end: number;
  importance: 'highlight';
  translation?: string;
  kind?: 'word' | 'phrase' | 'name' | 'number' | 'other';
  explanation?: string;
  pronunciation?: string;
  ipa?: string;
}

// ─── AI Prompt ──────────────────────────────────────────

function getLanguageName(code: string): string {
  switch (code) {
    case 'zh-TW': return '繁体中文';
    case 'ja': return '日文';
    case 'en': return '英文';
    case 'zh-CN':
    default: return '中文';
  }
}

export function getSystemPrompt(targetLanguage: string): string {
  const langName = getLanguageName(targetLanguage);
  return `你是一个高级的英文阅读辅助引擎。

任务：从英文段落中挑出"真正值得学习的重点 token"。标注必须【短语优先 + 宁缺毋滥】——固定搭配是最小单位，只有极少数不属于任何搭配的低频难词才按单词标注。不翻译整段。

====================
【输出预算 — 分类独立】
· 专有名词 n：不设上限，全部标出。
· 短语 p：积极识别，宁可多标不可少标。段落里几乎每个复合名词、介词短语、短语动词都应该被捕获。
· 单词 w：每 50 词最多 1 个，且必须是 CEFR B2+ 的低频/学术/技术难词。宁可不标，也不要把中频常用词塞进来。如果一个段落全是常见词，w 数量可以为 0。

====================
【处理顺序 — 严格三步走】
Step 1：扫描所有【专有名词】，标为 n。
Step 2：逐字符从左到右扫描整段，主动搜索下面 8 类短语，凡命中必须整体标为 p。这一步要贪婪 —— 宁可多也别漏。
Step 3：只在 Step 1-2 未覆盖的区间里，挑出真正的低频难词标为 w。如果只能找到常见词，就不要标 w。

====================
【短语类别 — 任一命中必须整体标为 p】
1. 动词+名词 搭配：take advantage of, make a difference, pay attention to, release updates, collect statistics, view data, opt out of, sign up for
2. 短语动词：break down, set up, give up, come up with, run into, look forward to, carry out, opt out, figure out, turn on, turn off
3. 形容词+名词 搭配：strong coffee, heavy rain, security updates, major version, current version, previous version, long-term solution, installation error, build error
4. 复合名词（极其重要，不要漏）：spell checker, climate change, open-source software, command line, operating system, data collection, user interface, analytics data, package manager, source code, error message, version statistics, web page, web site
5. 介词短语：in particular, at the same time, on the other hand, by means of, in terms of, as of, as well as, instead of, according to, due to
6. 副词+形容词/动词 搭配：highly recommended, widely used, well documented, deeply rooted, typically supports
7. 习语/谚语：piece of cake, hit the nail on the head, under the weather
8. 多词专业术语：machine learning, neural network, supply chain, real-time collaboration, user interface, cloud computing

====================
【专有名词（n）— 全部标出】
品牌名、软件名、产品名、人名、地名、机构名、组织名必须标为 n。
- 单词专有名词也要标
- 多词专有名词必须作为整体返回，如 "New York Times"、"macOS Sonoma"、"Google Analytics" 都是 1 个 n

====================
【w 的高门槛 — 什么才算"值得学习的难词"】
✅ 会标：低频/学术/技术词，如 ubiquitous, cumbersome, paradigm, instantiate, ephemeral, heuristic, concurrency, provenance
❌ 不标：B1 及以下常见词，包括但不限于：
   free, the, system, idea, name, use, run, software, package, management, operating, user, app, tool, file, make, get, good, thing, way, time, part, work, version, versions, update, updates, release, releases, support, supports, typical, typically, current, major, minor, previous, next, security, feature, product, service, data, code, library, framework, platform, device, network, browser, window, button, click, page, site, server, client, request, response, function, method, class, object, value, string, number, list, array, error, result, status, check, enable, disable, show, hide, open, close, start, stop, create, delete, add, remove, include, contain, provide, require, collect, view, install, installation, build

【极其重要】上面的"常见词黑名单"只限制它们作为【独立 w】单独出现。如果它们参与构成了 Step 2 的短语（例如 operating system / security updates / data collection / installation error），必须整体标为 p，绝对不能因为成分词在黑名单里就放弃整个短语。短语识别永远优先于单词过滤。

====================
【绝对禁止】
❌ 把已知搭配拆成若干 w。对 "take advantage of" 不得输出 take / advantage / of。
❌ 在一个 p 的 start-end 范围内再单独输出其中任何一个单词。
❌ 标注黑名单常见词作为独立 w。
❌ 因为成分词在黑名单里就放弃识别一个合法短语 —— 这是最严重的错误。

====================
【典型错误示例 — 模型常犯的错，绝对不要重复】

错例 A：拆散 + 误标常见词
原文："Homebrew typically supports macOS versions for which Apple still releases security updates, i.e., the current major version of macOS as well as the two previous major versions."
❌ 错误（密集 + 拆散 + 标常见词）：
  typically(w), versions(w), releases(w), security(w), updates(w), current(w), major(w), previous(w)
✅ 正确：
  {"t":[["Homebrew",0,8,"n","macOS 上的包管理器","Homebrew"],["macOS",29,34,"n","苹果桌面操作系统","macOS"],["Apple",59,64,"n","苹果公司","苹果"],["security updates",79,95,"p"],["major version",115,128,"p"],["as of",132,137,"p"],["previous major versions",158,181,"p"]]}

错例 B：漏标明显短语
原文："Homebrew collects installation, build error, and operating system version statistics via InfluxDB. Users can view analytics data. It is possible to opt out of data collection with the command brew analytics off."
❌ 错误（只标专有名词，短语全漏）：
  Homebrew(n), InfluxDB(n)
✅ 正确：
  {"t":[["Homebrew",0,8,"n","macOS 上的包管理器","Homebrew"],["installation",18,30,"w"],["build error",32,43,"p"],["operating system",49,65,"p"],["version statistics",66,84,"p"],["InfluxDB",89,97,"n","一个时序数据库","InfluxDB"],["analytics data",114,128,"p"],["opt out of",148,158,"p"],["data collection",159,174,"p"]]}
  解释：installation/collection/data/system 单独虽在黑名单，但它们参与的短语都要整体标为 p。

错例 C：历史叙述段落的典型过度标注
原文："In February 2015, due to downtime at SourceForge which resulted in binaries being unavailable, Homebrew moved their hosting to Bintray. On September 21, 2016, Homebrew version 1.0.0 was released."
❌ 错误（每个词都标，短语全部被拆散）：
  due(w), downtime(w), resulted(w), binaries(w), unavailable(w), hosting(w), version(w), released(w)
✅ 正确：
  {"t":[["due to",20,26,"p"],["downtime",27,35,"w"],["SourceForge",39,50,"n","一个开源代码托管平台"],["resulted in",57,68,"p"],["Homebrew",99,107,"n","macOS 上的包管理器","Homebrew"],["Bintray",128,135,"n","一个软件分发平台"]]}
  解释：due to / resulted in 是固定搭配必须标 p；version/released/hosting/unavailable 都是常见词，不标。downtime 是唯一一个可以考虑的 w。

====================
【说明字段】
n/e token 第 5 项必须给一句很短的${langName}事实说明（它是什么），不要写"保留原文""通常不翻译"这类规则说明。
第 6 项（${langName}名）规则：
- 人名：必须给${langName}译名（音译即可）
- 地名/机构名：如果有通行${langName}名则给，没有就省略
- 软件名/品牌名：如果有通行${langName}名则给，没有就省略

【数字规则】
独立数字不要返回；但数字属于专有名词整体时必须一起返回。

【格式规则】
不返回标点和空格。token 必须按原文顺序，start/end 精确匹配原文子串，不能重叠。

严格输出紧凑 JSON，不要 Markdown：
{"t":[[字段1,字段2,字段3,字段4,字段5,字段6]]}
字段1=原文文本, 字段2=start, 字段3=end, 字段4=类型(w/p/n/e)
字段5=${langName}说明（n/e 必填，w/p 省略）
字段6=${langName}译名（人名必填音译，其他有通行${langName}名才填，否则省略）

w/p 类型只需 4 个字段：["text",start,end,"w"]
n/e 类型至少 5 个字段，人名必须 6 个字段：["text",start,end,"n","说明","${langName}译名"]

====================
【输出前自检 — 必须在心里逐条验证】
在生成最终 JSON 之前，逐条检查：
1. 统计 w 数量：是否 ≤ 段落总词数 ÷ 50？如果超了，删掉最简单的。
2. 每个 w：能通过 CEFR B2 考试吗？如果不是高级词汇，删除。
3. 有没有任何一对相邻的 w 实际上是短语？如果是，合并为 p。
4. 短语有没有漏？检查有无 due to / resulted in / set up / carried out / in terms of 等常见搭配未被捕获。
5. 同一个词是否出现多次？只保留第一次。

====================
【示例 1 — 专有名词 + 复合名词】
输入："The app was created by John Smith at Nexora Labs, featuring a built-in spell checker and real-time collaboration."
输出：{"t":[["John Smith",27,37,"n","该应用的创建者","约翰·史密斯"],["Nexora Labs",41,52,"n","一家软件开发公司","奈索拉实验室"],["built-in",66,74,"w"],["spell checker",75,88,"p"],["real-time collaboration",93,116,"p"]]}

【示例 2 — 动词搭配 + 短语动词 + 复合名词】
输入："We need to take advantage of this opportunity to come up with a long-term solution before the deadline."
输出：{"t":[["take advantage of",11,28,"p"],["come up with",49,61,"p"],["long-term solution",64,82,"p"],["deadline",94,102,"w"]]}
注意：take / advantage / of / come / up / with / long / term / solution 都被搭配吸收，不再单独输出 w。`;
}

// ─── API 调用 ────────────────────────────────────────────

export async function translateParagraph(
  text: string,
  settings: RTTRSettings
): Promise<AnnotationResult[]> {
  if (!settings.apiKey) {
    throw new Error('请先在插件设置中配置 API Key');
  }

  const userPrompt = `【英文段落】：
${text}`;

  const response = await fetch(settings.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: getSystemPrompt(settings.targetLanguage || 'zh-CN') },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('AI 返回内容为空');
  }

  return parseAIResponse(content, text);
}

// ─── 解析 AI 响应 ────────────────────────────────────────

function parseAIResponse(content: string, originalText: string): AnnotationResult[] {
  try {
    console.log('[RTTR DEBUG] AI 原始 JSON:', content.slice(0, 2000));
    const json = JSON.parse(extractJson(content));
    const rawTokens = Array.isArray(json) ? json : (json?.t ?? json?.tokens ?? json?.results ?? []);
    return normalizeTokens(rawTokens, originalText);
  } catch (e) {
    const fallback = parseLegacyResponse(content, originalText);
    if (fallback.length > 0) {
      return fallback;
    }
    console.error('[RTTR] AI 响应解析失败:', content);
    throw new Error('AI 响应解析失败，请检查模型输出格式');
  }
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeTokens(rawTokens: unknown[], originalText: string): AnnotationResult[] {
  const results: AnnotationResult[] = [];
  let cursor = 0;

  for (const raw of rawTokens) {
    const item = normalizeRawToken(raw);
    if (!item) continue;
    const { text, importance, kind, translation, explanation } = item;
    if (!text) continue;

    let start = item.start;
    let end = item.end;

    if (start < 0 || end < 0 || end < start || originalText.slice(start, end) !== text) {
      const nextIndex = originalText.indexOf(text, cursor);
      if (nextIndex === -1) continue;
      start = nextIndex;
      end = nextIndex + text.length;
    }

    if (start < cursor) continue;
    cursor = end;

    results.push({
      text,
      word: text,
      start,
      end,
      importance,
      kind,
      translation,
      explanation,
    });
  }

  return results.sort((a, b) => a.start - b.start || a.end - b.end);
}

function normalizeRawToken(raw: unknown): (Pick<AnnotationResult, 'text' | 'start' | 'end' | 'importance'> & {
  kind?: AnnotationResult['kind'];
  translation?: string;
  explanation?: string;
}) | null {
  if (Array.isArray(raw)) {
    const text = typeof raw[0] === 'string' ? raw[0].trim() : '';
    // Detect legacy format: old format has importance ('h'/'l'/'m') at [3]
    const isLegacy = typeof raw[3] === 'string' && /^(h|l|m|highlight|latent|muted)$/.test(raw[3]);
    const kindIdx = isLegacy ? 4 : 3;
    const explanationIdx = isLegacy ? 5 : 4;
    const translationIdx = isLegacy ? 6 : 5;
    const kind = normalizeKind(typeof raw[kindIdx] === 'string' ? raw[kindIdx] : undefined);
    return {
      text,
      start: readInt(raw[1]),
      end: readInt(raw[2]),
      importance: 'highlight',
      kind,
      translation: shouldKeepCompactExplanation(kind) && typeof raw[translationIdx] === 'string' && raw[translationIdx].trim() ? raw[translationIdx].trim() : undefined,
      explanation: shouldKeepCompactExplanation(kind) ? normalizeExplanation(raw[explanationIdx]) : undefined,
    };
  }

  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const importance: AnnotationResult['importance'] = 'highlight';
  const kind = normalizeKind(typeof item.kind === 'string' ? item.kind : undefined);
  const text = typeof item.text === 'string'
    ? item.text.trim()
    : typeof item.word === 'string'
      ? item.word.trim()
      : '';

  return {
    text,
    start: readInt(item.start),
    end: readInt(item.end),
    importance,
    kind,
    translation: undefined,
    explanation: shouldKeepExplanation(item) ? normalizeExplanation(item.explanation) : undefined,
  };
}

function normalizeKind(kind?: string): AnnotationResult['kind'] | undefined {
  switch (kind) {
    case 'w':
    case 'word':
      return 'word';
    case 'p':
    case 'phrase':
      return 'phrase';
    case 'n':
    case 'name':
    case 'person':
    case 'place':
    case 'location':
    case 'organization':
    case 'proper_noun':
      return 'name';
    case 'e':
    case 'event':
    case 'allusion':
      return 'other';
    case 'num':
    case 'number':
      return 'number';
    default:
      return undefined;
  }
}

function shouldKeepCompactExplanation(kind?: AnnotationResult['kind']): boolean {
  return kind === 'name' || kind === 'other';
}

function normalizeExplanation(value: unknown): string | undefined {
  const explanation = readOptionalString(value);
  if (!explanation) return undefined;
  return isRuleLikeExplanation(explanation) ? undefined : explanation;
}

function isRuleLikeExplanation(text: string): boolean {
  return /(?:保留原文|不要翻译|无需翻译|不需要翻译|通常(?:不翻译|保留)|硬译|品牌名、软件名|专有名词)/.test(text);
}

function parseLegacyResponse(content: string, originalText: string): AnnotationResult[] {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('```'));
  const results: AnnotationResult[] = [];
  let cursor = 0;

  for (let line of lines) {
    line = line.replace(/^\||\|$/g, '').trim();
    if (!line || line.startsWith('---')) continue;

    const parts = line.split('|');
    if (parts.length < 2) continue;
    const text = parts[0].trim();
    const translation = parts[1].trim();
    if (!text || !translation) continue;

    const start = originalText.indexOf(text, cursor);
    if (start === -1) continue;
    const end = start + text.length;
    cursor = end;

    results.push({
      text,
      word: text,
      start,
      end,
      importance: 'highlight',
      translation,
      explanation: undefined,
    });
  }

  return results;
}

function readInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : -1;
  }
  return -1;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function shouldKeepExplanation(item: Record<string, unknown>): boolean {
  const kind = typeof item.kind === 'string' ? item.kind.toLowerCase() : '';
  if (['name', 'person', 'place', 'location', 'organization', 'event', 'allusion', 'proper_noun'].includes(kind)) {
    return true;
  }

  const category = typeof item.category === 'string' ? item.category.toLowerCase() : '';
  return ['name', 'person', 'place', 'location', 'organization', 'event', 'allusion', 'proper_noun'].includes(category);
}

// ─── 单词详细语境解释 ──────────────────────────────────────

const EXPLAIN_WORD_PROMPT = `你是一个高水平的英语语境词典引擎。

用户会提供一个【英文句子】和一个【目标词汇】。
你的任务是为目标词汇生成极其简洁的中文解释，直击要害，拒绝任何废话。

输出格式要求：
直接输出内容，不要使用 Markdown 代码块，不要废话。

格式规范如下：
【语境含义】：用一句话解释它在此句中的具体意思和作用。
【固定搭配】：(如果有) 指出与之相关的常用搭配；(如果没有) 直接忽略此项。`;

export async function explainWord(settings: RTTRSettings, word: string, sentence: string): Promise<string> {
  const messages = [
    { role: 'system', content: EXPLAIN_WORD_PROMPT },
    { role: 'user', content: `【目标词汇】：${word}\n【英文句子】：${sentence}` }
  ];

  const payload = {
    model: settings.model || 'gemini-2.5-pro',
    messages,
    temperature: 0.1,
  };

  const url = settings.apiEndpoint;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('AI 返回内容为空');
  }

  return content.trim();
}

// ─── AI 极简语境翻译 (仅翻译文本) ────────────────────────────────

function getContextualTranslatePrompt(langName: string): string {
  return `你是一个高级的英文语境分析与翻译引擎。

【核心任务】：
用户在阅读英文句子时，鼠标点击（或长按）了其中一个单词。你需要结合整个句子的语境，判断用户真正想了解的是什么，并给出最精准的${langName}翻译。

【强制规则】：
1. 绝不要输出任何多余的开头语、解释、拼音或 Markdown 语法！
2. 翻译必须精准贴合当前语境。`;
}

export async function contextualTranslate(settings: RTTRSettings, word: string, sentence: string): Promise<string> {
  const langName = getLanguageName(settings.targetLanguage || 'zh-CN');
  let systemPrompt = getContextualTranslatePrompt(langName);
  
  const collocEnabled = settings.enableContextualCollocation ?? true;
  if (collocEnabled) {
    systemPrompt += `
3. 【智能语境搭配（最高优先级）】：请务必检查用户点击的单词，在句子中是否与相邻的单词组成了复合名词、固定搭配或动词短语。
   - 如果是，你**必须自动向外扩展**，将整个词组作为一个整体提取出来，并输出该词组的翻译！
   - 如果没有搭配，才只翻译用户点击的独立单词。
4. 【输出格式】：不管你提取的是词组还是独立单词，输出格式必须严格为："英文原文 (${langName}翻译)"。
   - 错误示例（只输出翻译）："拳击比赛"`;
  } else {
    systemPrompt += `
3. 【输出格式】：只翻译用户点击的单词，输出格式必须严格为："英文原文 (${langName}翻译)"。`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `【用户点击的单词】：${word}\n【所在句子】：${sentence}` }
  ];

  const payload = {
    model: settings.model || 'gemini-2.5-pro',
    messages,
    temperature: 0.1,
  };

  const url = settings.apiEndpoint;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('AI 返回内容为空');
  }

  return content.trim();
}

const NUMBER_READING_PROMPT = `你是英文数字读法引擎。

任务：根据上下文判断用户选中的数字应该如何用英文朗读。
规则：
1. 只输出英文读法本身，不要解释，不要中文，不要 Markdown。
2. 如果数字后面带 days、years、months、percent、dollars 等单位，它是数量，必须按完整基数词读，不要读成编号或版本号。例如 365 days 应读作 three hundred sixty-five days，不能读作 three sixty five。
3. 如果是年份、日期、版本号、编号、引用标号、百分比、数量或产品名中的数字，要按当前语境选择自然读法。
4. 如果数字属于产品名或版本名，也只输出数字部分的英文读法。`;

export async function readNumberInContext(settings: RTTRSettings, numberText: string, sentence: string): Promise<string> {
  const messages = [
    { role: 'system', content: NUMBER_READING_PROMPT },
    { role: 'user', content: `【数字】：${numberText}\n【所在句子】：${sentence}` },
  ];

  const payload = {
    model: settings.model || 'gemini-2.5-pro',
    messages,
    temperature: 0,
  };

  const response = await fetch(settings.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI 返回内容为空');
  }

  return content
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\.$/, '');
}
