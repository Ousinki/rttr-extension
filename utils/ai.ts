/**
 * RTTR AI Translation Module
 * 封装 LLM API 调用，支持 OpenAI 兼容接口
 */

import type { RTTRSettings } from './storage';

// ─── 类型定义 ────────────────────────────────────────────

export interface AnnotationResult {
  word: string;
  translation: string;
  explanation?: string;
  pronunciation?: string;
}

// ─── AI Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `你是一个精准的英文语境翻译引擎。用户会发送一段英文文本。

你的任务：
1. 逐词识别段落中的实义词，给出语境翻译
2. **只有固定搭配、习语、短语动词**才合并为短语
3. 对于专有名词、技术术语或需要背景知识的词，再提供一个 \`explanation\` 字段，写一句简短的中文解释（约10-20字）。
4. **对于纯数字、年份或金额**（如 2025, 1990s, $100），不要强行翻译成中文（\`translation\` 保持和原文完全一致）。请在 \`pronunciation\` 字段提供它地道的**纯英文拼写读法**（例如 "twenty twenty-five"），并在 \`explanation\` 字段中也提供该读法，以悬浮窗形式展示。
5. **警告：绝对不要在任何地方返回音标（IPA）！**普通的英文单词（如 operating system）**不要**提供 \`pronunciation\` 字段。
6. 跳过虚词：冠词、单独介词、连词、代词、be动词、助动词

以 JSON 数组返回，不要包含任何其他文本：
[{"word":"原文","translation":"语境翻译","explanation":"(可选)名词解释","pronunciation":"(可选)发音提示"}]`;

// ─── API 调用 ────────────────────────────────────────────

export async function translateParagraph(
  text: string,
  settings: RTTRSettings
): Promise<AnnotationResult[]> {
  if (!settings.apiKey) {
    throw new Error('请先在插件设置中配置 API Key');
  }

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
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
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
    const parsed = JSON.parse(content);

    // 处理 AI 可能返回 { results: [...] } 或直接 [...]
    const results = Array.isArray(parsed) ? parsed : parsed.results || parsed.data || parsed.words || [];

    if (!Array.isArray(results)) {
      throw new Error('AI 返回格式不正确');
    }

    return results
      .filter(
        (item: unknown): item is AnnotationResult =>
          typeof item === 'object' &&
          item !== null &&
          'word' in item &&
          'translation' in item &&
          typeof (item as AnnotationResult).word === 'string' &&
          typeof (item as AnnotationResult).translation === 'string'
      )
      .map((item) => {
        const res: AnnotationResult = {
          word: item.word.trim(),
          translation: item.translation.trim(),
        };
        if ('explanation' in item && typeof item.explanation === 'string' && item.explanation.trim()) {
          res.explanation = item.explanation.trim();
        }
        if ('pronunciation' in item && typeof item.pronunciation === 'string' && item.pronunciation.trim()) {
          res.pronunciation = item.pronunciation.trim();
        }
        return res;
      });
  } catch (e) {
    console.error('[RTTR] AI 响应解析失败:', content);
    throw new Error('AI 响应解析失败，请检查模型输出格式');
  }
}
