/**
 * RTTR Phonetics Module — 三层瀑布式音标引擎
 *
 * 架构（复用 Sociology Blog lib/ipa.ts 的成熟模式）：
 * 1. Tier 1: 本地 JSON 词典 (ipa-dict en_US, ~126k 词) → O(1) 内存查找, < 0.01ms
 * 2. Tier 2: Free Dictionary API (dictionaryapi.dev) → ~50ms, 免费
 * 3. Tier 3: AI 查询 (用户配置的 LLM API) → ~1s, 结果持久化到 chrome.storage.local
 * 4. 返回 null → 优雅降级（TTS 仍可正常朗读）
 *
 * 所有 API 返回的音标都经过 narrowToKK() 清洗，统一为国内教材通用的宽式美式 KK 音标。
 */

import type { RTTRSettings } from './storage';
import { settingsStorage } from './storage';

// ─── 本地词典（懒加载） ───────────────────────────────────

let ipaDict: Record<string, string> | null = null;
let loadingPromise: Promise<void> | null = null;

// ─── 内存缓存 ────────────────────────────────────────────

const apiCache = new Map<string, string | null>();

// ─── 严式 → 宽式 KK 符号清洗 ─────────────────────────────

/**
 * 将严式 IPA / Wiktionary 风格音标转换为中国大陆通用的宽式美式 KK 音标。
 */
function narrowToKK(ipa: string): string {
  return ipa
    .replace(/ɹ/g, 'r')       // 齿龈近音 → 普通 r
    .replace(/ɫ/g, 'l')       // dark L → 普通 l
    .replace(/ɾ/g, 't')       // 齿龈闪音 → t
    .replace(/ɚ/g, 'ər')      // R 色彩化央元音 → ər
    .replace(/ɝ/g, 'ɜːr')     // R 色彩化半开央元音 → ɜːr
    .replace(/t͡ʃ/g, 'tʃ')     // 清龈后塞擦音
    .replace(/d͡ʒ/g, 'dʒ')     // 浊龈后塞擦音
    .replace(/\./g, '')        // 移除音节分隔点
    .trim();
}

// ─── Tier 1: 本地词典 ────────────────────────────────────

async function ensureLoaded(): Promise<void> {
  if (ipaDict) return;
  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  loadingPromise = (async () => {
    try {
      const url = browser.runtime.getURL('data/ipa-dict-en-us.json');
      const response = await fetch(url);
      if (!response.ok) {
        console.warn('[RTTR IPA] 本地词典加载失败:', response.status);
        ipaDict = {};
        return;
      }
      ipaDict = await response.json();
      console.log(`[RTTR IPA] 本地词典加载完成，${Object.keys(ipaDict!).length} 词条`);
    } catch (error) {
      console.warn('[RTTR IPA] 本地词典加载异常:', error);
      ipaDict = {};
    }
  })();

  await loadingPromise;
}

// ─── Tier 2: Free Dictionary API ─────────────────────────

async function queryFreeDictApi(word: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const phonetics = data[0]?.phonetics as Array<{ text?: string; audio?: string }> | undefined;
    if (phonetics) {
      // 优先选取带美式音频的条目
      for (const p of phonetics) {
        if (p.text && p.audio?.includes('-us')) {
          return p.text;
        }
      }
      // 次选任何有 text 的条目
      for (const p of phonetics) {
        if (p.text) return p.text;
      }
    }

    // 兜底：顶层 phonetic 字段
    const fallback = data[0]?.phonetic as string | undefined;
    if (fallback) return fallback;

    return null;
  } catch {
    return null;
  }
}

// ─── Tier 3: AI 查询 + 持久化 ────────────────────────────

const AI_IPA_STORAGE_KEY = 'rttr_ipa_memory';

const AI_IPA_PROMPT = `You are a phonetics expert. Provide the broad American English IPA transcription for the given word. Output ONLY the IPA in slashes, nothing else. Example: /ˈhɪltən/`;

async function queryAiIpa(word: string): Promise<string | null> {
  try {
    const settings = await settingsStorage.getValue();
    if (!settings.apiKey) return null;

    const response = await fetch(settings.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: AI_IPA_PROMPT },
          { role: 'user', content: word },
        ],
        temperature: 0,
        max_tokens: 50,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) return null;

    // 提取音标部分（去掉可能的多余文字）
    const match = content.match(/\/[^/]+\//);
    if (match) {
      const ipa = match[0];
      // 持久化到 chrome.storage.local（记忆库）
      await persistAiIpa(word, ipa);
      return ipa;
    }
    return null;
  } catch {
    return null;
  }
}

/** 将 AI 查询结果写入 chrome.storage.local 记忆库 */
async function persistAiIpa(word: string, ipa: string): Promise<void> {
  try {
    const stored = await browser.storage.local.get(AI_IPA_STORAGE_KEY);
    const memory: Record<string, string> = stored[AI_IPA_STORAGE_KEY] || {};
    memory[word.toLowerCase()] = ipa;
    await browser.storage.local.set({ [AI_IPA_STORAGE_KEY]: memory });
    console.log(`[RTTR IPA] AI 音标已存入记忆库: ${word} → ${ipa}`);
  } catch {
    // 静默失败
  }
}

/** 从 chrome.storage.local 记忆库读取 AI 历史查询结果 */
async function loadAiMemory(): Promise<Record<string, string>> {
  try {
    const stored = await browser.storage.local.get(AI_IPA_STORAGE_KEY);
    return stored[AI_IPA_STORAGE_KEY] || {};
  } catch {
    return {};
  }
}

// ─── 公开接口 ────────────────────────────────────────────

/**
 * 查询单个单词的 IPA 音标（三层瀑布）
 */
export async function getIpa(word: string): Promise<string | null> {
  const normalized = word.toLowerCase().replace(/[^a-z'-]/g, '');
  if (!normalized || normalized.length < 2) return null;

  // 1. 内存缓存
  if (apiCache.has(normalized)) {
    return apiCache.get(normalized) || null;
  }

  // 2. Tier 1: 本地词典
  await ensureLoaded();
  if (ipaDict && ipaDict[normalized]) {
    const ipa = narrowToKK(ipaDict[normalized]);
    apiCache.set(normalized, ipa);
    return ipa;
  }

  // 3. 检查 AI 记忆库（chrome.storage.local）
  const aiMemory = await loadAiMemory();
  if (aiMemory[normalized]) {
    const ipa = aiMemory[normalized];
    apiCache.set(normalized, ipa);
    return ipa;
  }

  // 4. Tier 2: Free Dictionary API
  const apiResult = await queryFreeDictApi(normalized);
  if (apiResult) {
    const cleaned = narrowToKK(apiResult.replace(/^\/|\/$/g, ''));
    const ipa = `/${cleaned}/`;
    apiCache.set(normalized, ipa);
    return ipa;
  }

  // 5. Tier 3: AI 查询（最终回退）
  const aiResult = await queryAiIpa(normalized);
  if (aiResult) {
    apiCache.set(normalized, aiResult);
    return aiResult;
  }

  // 全部未命中
  apiCache.set(normalized, null);
  return null;
}

/**
 * 批量查询音标（用于翻译结果的音标补全）
 */
export async function batchLookupIPA(
  words: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  // 确保本地词典已加载
  await ensureLoaded();

  // 对每个词进行三层查找
  const promises = words
    .filter(w => /^[a-zA-Z'-]+$/.test(w) && !w.includes(' '))
    .map(async (word) => {
      const ipa = await getIpa(word);
      if (ipa) result.set(word, ipa);
    });

  await Promise.all(promises);
  return result;
}
