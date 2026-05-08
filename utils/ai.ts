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

const SYSTEM_PROMPT = `你是一个高级的英文阅读辅助引擎。

任务：只把英文段落中值得学习的重点 token 标注出来，不要翻译整个段落。

【最高优先级：专有名词识别】
所有品牌名、软件名、产品名、人名、地名、机构名、组织名必须标注为 n。
- 单个词的专有名词也要标注
- 多词专有名词必须作为整体返回，不要拆开

【标注粒度：短语优先】
1. 固定搭配和短语是最小标注单位，不要拆开。
2. 只有不属于任何搭配的独立难词才以单词为单位标注。
3. 常见基础词不要标注（如 free, the, system, idea, name, use, run 等）。

【类型】
w=独立难词, p=固定搭配/短语, n=专有名词（品牌/软件/人名/地名/机构名）, e=事件/典故。

【说明字段】
n/e token 第 4 项必须给一句很短的中文事实说明（它是什么），不要写"保留原文""通常不翻译"这类规则说明。
第 5 项（中文名）规则：
- 人名：必须给中文译名（音译即可）
- 地名/机构名：如果有通行中文名则给，没有就省略
- 软件名/品牌名：如果有通行中文名则给，没有就省略

【数字规则】
独立数字不要返回；但数字属于专有名词整体时必须一起返回。

【格式规则】
不返回标点和空格。token 必须按原文顺序，start/end 精确匹配原文子串，不能重叠。

严格输出紧凑 JSON，不要 Markdown：
{"t":[[字段1,字段2,字段3,字段4,字段5,字段6]]}
字段1=原文文本, 字段2=start, 字段3=end, 字段4=类型(w/p/n/e)
字段5=中文说明（n/e 必填，w/p 省略）
字段6=中文译名（人名必填音译，其他有通行中文名才填，否则省略）

w/p 类型只需 4 个字段：["text",start,end,"w"]
n/e 类型至少 5 个字段，人名必须 6 个字段：["text",start,end,"n","说明","中文译名"]

输入示例："The app was created by John Smith at Nexora Labs, featuring a built-in spell checker and real-time collaboration."
输出示例：
{"t":[["John Smith",27,37,"n","该应用的创建者","约翰·史密斯"],["Nexora Labs",41,52,"n","一家软件开发公司","奈索拉实验室"],["built-in",66,74,"w"],["spell checker",75,88,"p"],["real-time collaboration",93,116,"p"]]}`;

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
        { role: 'system', content: SYSTEM_PROMPT },
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

const CONTEXTUAL_TRANSLATE_PROMPT = `你是一个高级的英文语境分析与翻译引擎。

【核心任务】：
用户在阅读英文句子时，鼠标点击（或长按）了其中一个单词。你需要结合整个句子的语境，判断用户真正想了解的是什么，并给出最精准的中文翻译。

【强制规则】：
1. 绝不要输出任何多余的开头语、解释、拼音或 Markdown 语法！
2. 翻译必须精准贴合当前语境。`;

export async function contextualTranslate(settings: RTTRSettings, word: string, sentence: string): Promise<string> {
  let systemPrompt = CONTEXTUAL_TRANSLATE_PROMPT;
  
  const collocEnabled = settings.enableContextualCollocation ?? true;
  if (collocEnabled) {
    systemPrompt += `
3. 【智能语境搭配（最高优先级）】：请务必检查用户点击的单词，在句子中是否与相邻的单词组成了复合名词、固定搭配或动词短语。
   - 如果是，你**必须自动向外扩展**，将整个词组作为一个整体提取出来，并输出该词组的翻译！
   - 如果没有搭配，才只翻译用户点击的独立单词。
4. 【输出格式】：不管你提取的是词组还是独立单词，输出格式必须严格为："英文原文 (中文翻译)"。
   - 错误示例（只输出中文）："拳击比赛"`;
  } else {
    systemPrompt += `
3. 【输出格式】：只翻译用户点击的单词，输出格式必须严格为："英文原文 (中文翻译)"。`;
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
