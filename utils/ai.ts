/**
 * RTTR AI Translation Module
 * 封装 LLM API 调用，支持 OpenAI 兼容接口
 */

import type { RTTRSettings } from './storage';
import nlp from 'compromise';
import { shouldSkip } from './skip-words';

// ─── 类型定义 ────────────────────────────────────────────

export interface AnnotationResult {
  word: string;
  translation: string;
  explanation?: string;
  pronunciation?: string;
  ipa?: string;
}

// ─── AI Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `你是一个精准的英语词典翻译引擎。

你的任务：
用户会提供一段英文的【上下文】，以及一个用 JSON 数组格式提供的【需要翻译的短语/单词列表】。
请**仅仅针对列表中的词汇**，结合给定的上下文，提供最精准的中文翻译。

【核心要求】：
1. 必须严格按照列表的顺序逐一翻译，绝对不能自作主张去翻译列表中不存在的单词，也不能张冠李戴（比如把晚宴的解释安在总统头上）！
2. **高质量百科解释（悬浮窗内容）**：对于专有名词（人名、机构名、地名、专有事件），请提供**有价值的百科式背景介绍（10-30字以内）**。例如对于 "Washington Hilton hotel"，不要只写废话（如"酒店名称"），应当写"华盛顿特区著名的地标性豪华酒店，常举办政治集会"。
3. **极其重要：对于普通的动词、名词、形容词等（如 shoot, rushed, attempt），绝对不要提供任何解释！该列必须留空！** 只有专有名词需要填此列。
4. **对于纯数字、年份**（如 2025），不要翻译，直接在其"解释"列提供英文拼写读法（如 twenty twenty-five）。
5. **绝对不要输出音标！** 音标由前端引擎独立处理，你只需要输出翻译和解释。

**输出格式要求（为了极限速度）**：
绝对不要使用 JSON 对象。严格按照以下格式输出，每行一个结果，用竖线 | 分隔。一共 3 列。
字段顺序：列表原文|语境翻译|中文解释(可选)

直接输出纯文本结果，不要任何Markdown语法或多余解释。`;

// ─── API 调用 ────────────────────────────────────────────

export async function translateParagraph(
  text: string,
  settings: RTTRSettings
): Promise<AnnotationResult[]> {
  if (!settings.apiKey) {
    throw new Error('请先在插件设置中配置 API Key');
  }

  // 1. 本地 NLP 引擎智能分词
  const doc = nlp(text);
  const chunksSet = new Set<string>();

  // 优先提取实体和名词短语
  doc.people().out('array').forEach((c: string) => chunksSet.add(c.trim()));
  doc.places().out('array').forEach((c: string) => chunksSet.add(c.trim()));
  doc.organizations().out('array').forEach((c: string) => chunksSet.add(c.trim()));
  doc.nouns().out('array').forEach((c: string) => chunksSet.add(c.trim()));
  doc.verbs().out('array').forEach((c: string) => chunksSet.add(c.trim()));
  doc.adjectives().out('array').forEach((c: string) => chunksSet.add(c.trim()));
  doc.adverbs().out('array').forEach((c: string) => chunksSet.add(c.trim()));

  // 2. 本地过滤：去除被标点符号污染的词，以及基础虚词
  let validChunks = Array.from(chunksSet)
    .map(chunk => {
      // 核心修复：去除首尾的非字母/数字符号（如逗号、句号）
      // 这极其重要，因为如果带着逗号，前端的 \b 正则表达式将无法匹配单词边界！
      let clean = chunk.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
      // 移除开头的冠词 (the, a, an)
      clean = clean.replace(/^(the|a|an)\s+/i, '').trim();
      return clean;
    })
    .filter(chunk => {
      // 移除只包含标点或数字的无效块
      if (!/[a-zA-Z]/.test(chunk)) return false;
      // 移除基础虚词
      if (shouldSkip(chunk)) return false;
      return true;
    });

  // 对数组进行去重
  validChunks = Array.from(new Set(validChunks));

  // 如果本地引擎没有提炼出任何需要翻译的词，直接返回
  if (validChunks.length === 0) {
    return [];
  }

  // 构建专门的用户请求
  const userPrompt = `【上下文】：
${text}

【需要你翻译的短语/单词列表】：
${JSON.stringify(validChunks)}`;

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

  return parseAIResponse(content);
}

// ─── 解析 AI 响应 ────────────────────────────────────────

function parseAIResponse(content: string): AnnotationResult[] {
  try {
    // 过滤掉空行和可能包含 markdown 代码块语法的行
    const lines = content.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('\`'));
    const results: AnnotationResult[] = [];
    
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 2) {
        const res: AnnotationResult = {
          word: parts[0].trim(),
          translation: parts[1].trim(),
        };
        if (parts.length >= 3 && parts[2].trim()) {
          res.explanation = parts[2].trim();
        }
        // 注意：IPA 音标不再由 AI 生成，而是由 utils/phonetics.ts 本地引擎独立查询
        if (res.word && res.translation) {
           results.push(res);
        }
      }
    }
    return results;
  } catch (e) {
    console.error('[RTTR] AI 响应解析失败:', content);
    throw new Error('AI 响应解析失败，请检查模型输出格式');
  }
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
  
  if (settings.enableContextualCollocation) {
    systemPrompt += `
3. 【智能语境搭配（最高优先级）】：请务必检查用户点击的单词，在句子中是否与相邻的单词组成了“复合名词”（如 boxing match）、“固定搭配”（如 locked eyes）或“动词短语”（如 take off）。
   - 如果是，你**必须自动向外扩展**，将整个词组作为一个整体提取出来，并输出该词组的翻译！
   - 如果没有搭配，才只翻译用户点击的独立单词。
4. 【输出格式】：不管你提取的是词组还是独立单词，输出格式必须严格为："英文原文 (中文翻译)"。
   - 正确示例（复合名词）："boxing match (拳击比赛)"
   - 正确示例（普通单词）："before (在...之前)"
   - 错误示例（只输出中文）："拳击比赛"`;
  } else {
    systemPrompt += `
3. 【输出格式】：只翻译用户点击的单词，输出格式必须严格为："英文原文 (中文翻译)"。例如："boxing (拳击)"。`;
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
