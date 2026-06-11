/**
 * RTTR Storage Layer
 * 管理用户设置和已知词表，使用 chrome.storage.sync 支持跨设备同步
 */

import { storage } from '#imports';

// ─── 类型定义 ────────────────────────────────────────

export interface CustomSearchEngine {
  name: string;          // 显示名称
  urlTemplate: string;   // URL 模板，使用 {query} 占位符
  enabled: boolean;
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
  translationPosition: 'top' | 'bottom' | 'pronounce-badge'; // 翻译悬浮窗位置
  showTranslationEngine: boolean;                 // 是否显示引擎标识
  showSingleClickIPA: boolean;                    // 单击发音时是否显示音标悬浮窗
  enableAutoTranslate: boolean;                   // 划词松手自动翻译
  enableClickTranslate: boolean;                  // 划词后点击选区翻译
  enableLongPressTranslate: boolean;              // 长按/选中长按进行 AI 语境翻译
  enableContextualCollocation: boolean;           // 智能语境搭配分析
  paragraphShortcut: string;                      // 段落翻译快捷键 (例如 'Alt+KeyT')
  targetLanguage: 'zh-CN' | 'zh-TW' | 'ja' | 'en'; // 目标翻译语言
  enableNumberConversion: boolean;                   // 数字单位转换 (100 million → 1亿)
  enableContextMenu: boolean;                         // 右键自定义菜单
  enableSearchX: boolean;                             // 右键搜索 X (Twitter)
  enableSearchReddit: boolean;                        // 右键搜索 Reddit
  enableSearchGoogle: boolean;                        // 右键搜索 Google
  customSearchEngines: CustomSearchEngine[];           // 用户自定义搜索引擎
  enableContextMenuInfo: boolean;                      // 右键菜单发音后显示音标/翻译
  enableInlineSyllableRuby: boolean;                  // 单击单词时断音节 (Syllabification)
  syllableDisplayMode: 'inline' | 'badge' | 'overlay'; // 音节展示模式
  autoTranslateFocus: boolean;                        // 聚焦句子时自动翻译
  sentenceFocusStyle: 'dim' | 'hl-yellow' | 'hl-blue' | 'hl-red'; // 聚焦句子样式
  enableInlineParagraphTranslate: boolean;             // 段落内联翻译开关
  inlineParagraphTrigger: 'shift' | 'ctrl' | 'alt' | 'longpress' | 'direct' | 'custom'; // 触发方式
  inlineParagraphCustomShortcut: string;               // 自定义快捷键 (如 'Alt+KeyP')

  // Bilibili 双语精读增强设置
  enableBiliStudy: boolean;                           // 是否启用 B 站双语精读助手
  biliAutoPause: boolean;                             // B 站视频精读时自动暂停
  biliCustomSubtitles: boolean;                       // 隐藏 B 站原生字幕并渲染 RTTR 交互字幕
  biliHudVisible: boolean;                            // 默认显示精读讲义 HUD 面板
  biliSubtitleHoverPause: 'off' | 'hover' | 'click';  // 原生字幕暂停模式：关闭/悬停暂停/点击暂停
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
  paragraphShortcut: 'Alt+KeyT',
  targetLanguage: 'zh-CN',
  enableNumberConversion: true,
  enableContextMenu: true,
  enableSearchX: true,
  enableSearchReddit: false,
  enableSearchGoogle: true,
  customSearchEngines: [],
  enableContextMenuInfo: true,
  enableInlineSyllableRuby: true,
  syllableDisplayMode: 'badge',
  autoTranslateFocus: false,
  sentenceFocusStyle: 'dim',
  enableInlineParagraphTranslate: true,
  inlineParagraphTrigger: 'shift',
  inlineParagraphCustomShortcut: 'Alt+KeyP',

  enableBiliStudy: true,
  biliAutoPause: false,
  biliCustomSubtitles: true,
  biliHudVisible: true,
  biliSubtitleHoverPause: 'hover',
};

// ─── Storage Items (WXT 类型安全存储) ────────────────────

export const settingsStorage = storage.defineItem<RTTRSettings>(
  'sync:rttr-settings',
  { fallback: DEFAULT_SETTINGS }
);



