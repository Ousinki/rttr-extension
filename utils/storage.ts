/**
 * RTTR Storage Layer
 * 管理用户设置和已知词表，使用 chrome.storage.sync 支持跨设备同步
 */

import { storage } from '#imports';

// ─── 类型定义 ────────────────────────────────────────────

export interface KnownWord {
  word: string;          // 单词原形（lemma）
  dismissedAt: number;   // 标记时间戳
  dismissCount: number;  // 累计被取消次数（越多越确认掌握）
}

export interface RTTRSettings {
  apiKey: string;
  apiEndpoint: string;     // OpenAI 兼容接口地址
  model: string;           // 使用的模型名

  enabled: boolean;        // 全局开关
  ttsLanguage: string;     // TTS 语言 (如 en-US)
  ttsRate: number;         // TTS 语速 (0.1 - 2.0)
  ttsVolume: number;       // TTS 音量 (0.0 - 1.0)
  ttsVoiceURI: string;     // TTS 发音人 URI
  enableAutoPronounce: boolean;     // 划词自动发音
  enableClickPronounce: boolean;    // 划词后点击发音
  enableShortcutPronounce: boolean; // 快捷键发音
  enableSingleClickPronounce: boolean; // 单击发音
  translationEngine: 'none' | 'google' | 'deepl' | 'bing'; // 悬浮窗翻译引擎
  translationPosition: 'top' | 'bottom';          // 翻译悬浮窗位置
  showTranslationEngine: boolean;                 // 是否显示引擎标识
  showSingleClickIPA: boolean;                    // 单击发音时是否显示音标悬浮窗
  enableAutoTranslate: boolean;                   // 划词松手自动翻译
  enableClickTranslate: boolean;                  // 划词后点击选区翻译
  enableLongPressTranslate: boolean;              // 长按/选中长按进行 AI 语境翻译
  enableContextualCollocation: boolean;           // 智能语境搭配分析
  paragraphShortcut: string;                      // 段落翻译快捷键 (例如 'Alt+KeyT')
  targetLanguage: 'zh-CN' | 'zh-TW' | 'ja' | 'en'; // 目标翻译语言
}

// ─── 默认值 ──────────────────────────────────────────────

const DEFAULT_SETTINGS: RTTRSettings = {
  apiKey: '',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',

  enabled: true,
  ttsLanguage: 'en-US',
  ttsRate: 0.85,
  ttsVolume: 1.0,
  ttsVoiceURI: 'Google US English',
  enableAutoPronounce: true,
  enableClickPronounce: false,
  enableShortcutPronounce: true,
  enableSingleClickPronounce: true,
  translationEngine: 'google',
  translationPosition: 'bottom',
  showTranslationEngine: true,
  showSingleClickIPA: true,
  enableAutoTranslate: true,
  enableClickTranslate: false,
  enableLongPressTranslate: true,
  enableContextualCollocation: true,
  paragraphShortcut: '',
  targetLanguage: 'zh-CN',
};

// ─── Storage Items (WXT 类型安全存储) ────────────────────

export const settingsStorage = storage.defineItem<RTTRSettings>(
  'sync:rttr-settings',
  { fallback: DEFAULT_SETTINGS }
);

export const knownWordsStorage = storage.defineItem<KnownWord[]>(
  'sync:rttr-known-words',
  { fallback: [] }
);

// ─── 辅助函数 ────────────────────────────────────────────

/**
 * 获取已知词的 Set（用于快速过滤）
 */
export async function getKnownWordsSet(): Promise<Set<string>> {
  const words = await knownWordsStorage.getValue();
  return new Set(words.map((w) => w.word.toLowerCase()));
}

/**
 * 添加已知词（如果已存在则增加 dismissCount）
 */
export async function addKnownWord(word: string): Promise<void> {
  const words = await knownWordsStorage.getValue();
  const lowerWord = word.toLowerCase();
  const existing = words.find((w) => w.word.toLowerCase() === lowerWord);

  if (existing) {
    existing.dismissCount += 1;
    existing.dismissedAt = Date.now();
  } else {
    words.push({
      word: lowerWord,
      dismissedAt: Date.now(),
      dismissCount: 1,
    });
  }

  await knownWordsStorage.setValue(words);
}

/**
 * 移除已知词（恢复标注）
 */
export async function removeKnownWord(word: string): Promise<void> {
  const words = await knownWordsStorage.getValue();
  const filtered = words.filter((w) => w.word.toLowerCase() !== word.toLowerCase());
  await knownWordsStorage.setValue(filtered);
}
