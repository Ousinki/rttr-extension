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
  ipa?: string;
}

// ─── AI Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `你是一个精准的英文语境翻译引擎。用户会发送一段英文文本。

你的任务：
1. 逐词识别段落中的实义词，给出语境翻译
2. **只有固定搭配、习语、短语动词**才合并为短语
3. 对于专有名词、技术术语或需要背景知识的词，再提供一个中文解释（约10-20字）。
4. **对于纯数字、年份或金额**（如 2025, 1990s, $100），不要强行翻译成中文（翻译保持和原文一致）。请提供它地道的**纯英文拼写读法**（例如 "twenty twenty-five"）作为发音提示，并在解释中也提供该读法，以悬浮窗展示。
5. **重要**：提供每个普通英文单词的国际音标（IPA），并用斜杠包裹（例如 /həˈləʊ/）。
6. 跳过虚词：冠词、单独介词、连词、代词、be动词、助动词

**输出格式要求（极其重要）**：
为了极致的响应速度，**绝对不要使用 JSON**。请严格按照以下格式输出，每行一个词汇结果，使用竖线 | 分隔字段。
字段顺序：原文|语境翻译|中文解释(可选)|发音提示(可选)|音标(可选)

示例：
Homebrew|Homebrew|macOS 上的包管理器||/ˈhoʊmˌbru/
typically|通常|||/ˈtɪpɪkli/
supports|支持|||/səˈpɔrts/
2025|2025|twenty twenty-five|twenty twenty-five|

不要输出任何其他的解释文字、Markdown 标记或代码块语法，直接输出上述格式的纯文本。`;

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
        if (parts.length >= 4 && parts[3].trim()) {
          res.pronunciation = parts[3].trim();
        }
        if (parts.length >= 5 && parts[4].trim()) {
          res.ipa = parts[4].trim();
        }
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
