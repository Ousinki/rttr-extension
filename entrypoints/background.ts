/**
 * RTTR Background Service Worker
 *
 * 职责：
 * 1. 监听 Content Script 消息
 * 2. 调用 AI API 进行翻译
 * 3. 前端过滤已知词
 * 4. 管理已知词存储
 * 5. 转发 Chrome Commands 快捷键事件
 */

import { translateParagraph, explainWord, contextualTranslate, readNumberInContext } from '@/utils/ai';
import { getIpa } from '@/utils/phonetics';
import { handleFetchTranslation } from '@/utils/translator';
import type { RTTRMessage, TranslateResponse, LookupIpaResponse } from '@/utils/messaging';
import { settingsStorage } from '@/utils/storage';
import { shouldSkip } from '@/utils/skip-words';
import type { AnnotationResult } from '@/utils/ai';

const PARAGRAPH_SEGMENT_CACHE_KEY = 'rttr_paragraph_segment_cache_v4';
const SEGMENT_TIMEOUT_MS = 15000;
const MAX_SEGMENT_CACHE_ENTRIES = 150;
const PHRASE_CONNECTORS = new Set([
  'about', 'after', 'against', 'around', 'at', 'between', 'by', 'for', 'from',
  'in', 'into', 'of', 'off', 'on', 'out', 'over', 'through', 'to', 'up',
  'with', 'within', 'without', 'and',
]);
const BASIC_PARAGRAPH_WORDS = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
  'a', 'an', 'the', 'do', 'does', 'did', 'be', 'am', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'can', 'could', 'will', 'would', 'should', 'may', 'might',
  'all', 'more', 'most', 'well', 'help', 'speak', 'work', 'working', 'change',
  'changing', 'people', 'home', 'talk', 'need', 'write', 'perfect', 'email',
  'advice', 'career', 'time',
]);

export default defineBackground(() => {
  console.log('[RTTR] Background service worker started', {
    id: browser.runtime.id,
  });

  // ─── 图标开关逻辑 ──────────────────────────────────────
  // 没有 popup → 点击图标直接触发 action.onClicked

  /** 更新扩展图标的视觉状态（badge + 灰度图标） */
  async function updateIconState(enabled: boolean) {
    if (enabled) {
      // 启用状态：清除 badge，恢复正常图标
      await browser.action.setBadgeText({ text: '' });
      await browser.action.setIcon({
        path: {
          16: '/icon/16.png',
          32: '/icon/32.png',
          48: '/icon/48.png',
          96: '/icon/96.png',
          128: '/icon/128.png',
        },
      });
      await browser.action.setTitle({ title: 'RTTR — 点击关闭' });
    } else {
      // 禁用状态：显示灰色 OFF badge + 灰度图标
      await browser.action.setBadgeText({ text: 'OFF' });
      await browser.action.setBadgeBackgroundColor({ color: '#6b7280' });
      await browser.action.setBadgeTextColor({ color: '#ffffff' });

      // 生成灰度图标
      try {
        const sizes = [16, 32, 48] as const;
        const imageDataMap: Record<number, ImageData> = {};
        for (const size of sizes) {
          const response = await fetch(browser.runtime.getURL(`/icon/${size}.png`));
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(size, size);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0, size, size);
          const imageData = ctx.getImageData(0, 0, size, size);
          // 转灰度 + 降低对比度
          for (let i = 0; i < imageData.data.length; i += 4) {
            const gray = imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114;
            const muted = gray * 0.7 + 80; // 偏亮灰色
            imageData.data[i] = muted;
            imageData.data[i + 1] = muted;
            imageData.data[i + 2] = muted;
            imageData.data[i + 3] = imageData.data[i + 3] * 0.6; // 降低不透明度
          }
          imageDataMap[size] = imageData;
        }
        await browser.action.setIcon({ imageData: imageDataMap as any });
      } catch (err) {
        console.warn('[RTTR] 灰度图标生成失败，仅使用 badge:', err);
      }

      await browser.action.setTitle({ title: 'RTTR — 点击开启' });
    }
  }

  // 初始化图标状态
  settingsStorage.getValue().then((s) => updateIconState(s.enabled));

  // 监听设置变化（如从 Options 页面切换）
  settingsStorage.watch((newVal) => {
    if (newVal) updateIconState(newVal.enabled);
  });

  // 点击图标 → 切换开关
  browser.action.onClicked.addListener(async () => {
    const settings = await settingsStorage.getValue();
    settings.enabled = !settings.enabled;
    await settingsStorage.setValue(settings);
    // updateIconState 会由 watch 回调自动触发
    console.log(`[RTTR] 扩展已${settings.enabled ? '启用' : '禁用'}`);
  });

  // ─── 监听消息 ──────────────────────────────────────────
  browser.runtime.onMessage.addListener(
    (message: RTTRMessage, _sender, sendResponse) => {
      switch (message.type) {
        case 'TRANSLATE':
          handleTranslate(message.text)
            .then(sendResponse)
            .catch((err) =>
              sendResponse({
                success: false,
                error: err.message,
              } satisfies TranslateResponse)
            );
          return true; // 异步响应




        case 'LOOKUP_IPA':
          getIpa(message.word)
            .then((ipa) => sendResponse({ ipa } satisfies LookupIpaResponse))
            .catch(() => sendResponse({ ipa: null } satisfies LookupIpaResponse));
          return true;

        case 'EXPLAIN_WORD':
          handleExplainWord(message.word, message.sentence)
            .then(sendResponse)
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;

        case 'CONTEXTUAL_TRANSLATE':
          handleContextualTranslate(message.word, message.sentence)
            .then(sendResponse)
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;

        case 'READ_NUMBER':
          handleReadNumber(message.numberText, message.sentence)
            .then(sendResponse)
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;

        case 'OPEN_OPTIONS':
          browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
          sendResponse({ success: true });
          return false;

        case 'FETCH_IMAGE_BASE64':
          handleFetchImageBase64(message.url)
            .then((base64) => sendResponse({ base64 }))
            .catch(() => sendResponse({ base64: null }));
          return true;

        case 'FETCH_TRANSLATION':
          handleFetchTranslation(message.text, message.sourceLang, message.targetLang, message.engine)
            .then((res) => sendResponse(res))
            .catch((err) => sendResponse({ targetText: '', engine: message.engine, error: err.message }));
          return true;

        default:
          return false;
      }
    }
  );

  async function handleFetchImageBase64(url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error('[RTTR] Failed to fetch image cross-origin:', e);
      return null;
    }
  }

  // ─── Chrome Commands API（全局快捷键） ─────────────────
  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'translate-paragraph') {
      // 获取当前活跃标签页，发送触发消息
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id) {
        browser.tabs.sendMessage(tab.id, { type: 'TRIGGER_TRANSLATE' });
      }
    }
  });

  // ─── 翻译处理 ──────────────────────────────────────────
  async function handleTranslate(text: string): Promise<TranslateResponse> {
    const settings = await settingsStorage.getValue();

    if (!settings.apiKey) {
      return {
        success: false,
        error: '请先在 RTTR 设置中配置 API Key',
      };
    }

    if (!settings.enabled) {
      return {
        success: false,
        error: 'RTTR 已禁用',
      };
    }

    const aiResults = await getSegmentedTokens(text, settings);
    // 🔍 DEBUG: AI 原始输出
    console.log('[RTTR DEBUG] AI 原始输出:', aiResults.map(r => `${r.kind}:${r.word}`));
    console.log('[RTTR DEBUG] phrase 数量:', aiResults.filter(r => r.kind === 'phrase').length);
    console.log('[RTTR DEBUG] word 数量:', aiResults.filter(r => r.kind === 'word').length);
    console.log('[RTTR DEBUG] name 数量:', aiResults.filter(r => r.kind === 'name').length);

    const translatedResults = await translateVisibleTokens(text, aiResults, settings.translationEngine, settings.targetLanguage);
    // 🔍 DEBUG: 翻译后结果
    console.log('[RTTR DEBUG] 翻译后:', translatedResults.map(r => `${r.kind}:${r.word}→${r.translation}`));

    // Filter out basic skip words + dedup (same word only annotated once per paragraph)
    const seenTokens = new Set<string>();
    const displayResults = translatedResults
      .filter((item) => {
        const normalized = item.word.toLowerCase();
        // Skip common words (only for standalone w)
        if (item.kind === 'word' && shouldSkip(normalized)) return false;
        // Skip if translation is empty or identical to source
        if (item.kind !== 'name' &&
          (!item.translation || item.word.toLowerCase() === item.translation.toLowerCase())) {
          return false;
        }
        // Dedup: for w/p tokens, only keep first occurrence
        // Names (n) are exempt — they may appear in different contexts
        if (item.kind === 'word' || item.kind === 'phrase') {
          if (seenTokens.has(normalized)) return false;
          seenTokens.add(normalized);
        }
        return true;
      })
      .sort((a, b) => a.start - b.start || a.end - b.end);

    // 🔍 DEBUG: 最终显示
    console.log('[RTTR DEBUG] 最终显示:', displayResults.map(r => `${r.kind}:${r.word}`));

    return {
      success: true,
      results: displayResults,
    };
  }

  async function getSegmentedTokens(text: string, settings: Awaited<ReturnType<typeof settingsStorage.getValue>>): Promise<AnnotationResult[]> {
    // TODO: 缓存已禁用——每次触发都重新调用 AI，方便调试 Prompt。
    // 稳定后恢复缓存：取消下方注释，删除直接调用。
    // const cacheKey = await createSegmentCacheKey(text, settings.model, settings.targetLanguage || 'zh-CN');
    // const cached = await readSegmentCache(cacheKey);
    // if (cached) return cached;

    const segmentPromise = translateParagraph(text, settings);
    try {
      const tokens = await withTimeout(
        segmentPromise,
        SEGMENT_TIMEOUT_MS,
        `LLM 分词超过 ${SEGMENT_TIMEOUT_MS}ms`
      );
      // await writeSegmentCache(cacheKey, tokens);
      return tokens;
    } catch (err) {
      console.warn('[RTTR] AI 分词超时或失败，先使用本地粗分词兜底:', err);

      segmentPromise
        // .then((tokens) => writeSegmentCache(cacheKey, tokens))
        .catch((lateErr) => console.warn('[RTTR] 后台分词最终也失败:', lateErr));

      return [];
    }
  }

  async function translateVisibleTokens(
    text: string,
    aiResults: AnnotationResult[],
    engine: 'none' | 'google' | 'deepl' | 'bing',
    targetLang: string
  ): Promise<AnnotationResult[]> {
    const visibleTokens = aiResults.filter((item) => !isStandaloneNumberToken(item));
    // AI returned results → use directly; fallback only when AI returns nothing
    const tokens = visibleTokens.length > 0 ? visibleTokens : tokenizePlainWords(text);
    if (tokens.length === 0) return [];

    const tokensWithoutStandaloneNumbers = tokens.filter((token) => !isStandaloneNumberToken(token));
    const directTokens = tokensWithoutStandaloneNumbers
      .filter((token) => shouldKeepOriginalToken(token))
      .map((token) => normalizeDirectToken(token));
    const translatableTokens = tokensWithoutStandaloneNumbers.filter((token) => !shouldKeepOriginalToken(token));

    if (engine === 'none') {
      return [
        ...directTokens,
        ...translatableTokens.map((token) => ({
          ...token,
          translation: token.word,
        })),
      ].sort((a, b) => a.start - b.start || a.end - b.end);
    }

    const uniqueTexts = Array.from(new Set(translatableTokens.map((token) => token.word.toLowerCase())));
    const translationMap = await translateTextList(uniqueTexts, engine, targetLang);

    const translated = translatableTokens
      .map((token) => ({
        ...token,
        translation: translationMap.get(token.word.toLowerCase()) || token.word,
      }))
      .filter((token) => token.translation.toLowerCase() !== token.word.toLowerCase());

    return [...directTokens, ...translated];
  }



  function shouldKeepOriginalToken(token: AnnotationResult): boolean {
    return token.kind === 'name' || isBrandLikeToken(token.word) || isLikelyProperNoun(token);
  }

  /**
   * If the AI annotated a capitalized single word but didn't tag it as 'name',
   * it's still very likely a proper noun (brand, software, product).
   * Common words like "The", "In" won't reach here because the AI filters them.
   */
  function isLikelyProperNoun(token: AnnotationResult): boolean {
    const word = token.word.trim();
    if (!word || token.kind === 'name') return false;
    // Single capitalized word that the AI thought was important → proper noun
    return /^[A-Z][a-z]/.test(word) && !word.includes(' ');
  }

  function normalizeDirectToken(token: AnnotationResult): AnnotationResult {
    return {
      ...token,
      translation: token.translation,
      explanation: token.explanation,
    };
  }

  function isBrandLikeToken(text: string): boolean {
    return /[A-Z][a-z]+[A-Z][A-Za-z]*|[A-Z]{2,}|[A-Za-z]+\d|\d[A-Za-z]+/.test(text);
  }

  function isNumberLikeToken(text: string): boolean {
    return /^(?:\[\d+\]|\d+(?:,\d{3})*(?:\.\d+)*(?:\s?(?:days?|years?|months?|percent|%))?)$/i.test(text.trim());
  }

  function isStandaloneNumberToken(token: AnnotationResult): boolean {
    return isNumberLikeToken(token.word);
  }

  function tokenizePlainWords(text: string): AnnotationResult[] {
    const tokens: AnnotationResult[] = [];
    const pattern = /[A-Za-z]+(?:[-'][A-Za-z]+)*/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text))) {
      const word = match[0];
      const start = match.index;
      const end = start + word.length;
      if (word.length <= 1) continue;
      if (shouldSkip(word.toLowerCase()) || BASIC_PARAGRAPH_WORDS.has(word.toLowerCase())) continue;

      tokens.push({
        text: word,
        word,
        start,
        end,
        importance: 'highlight',
        kind: 'word',
        translation: word,
      });
    }

    return tokens;
  }

  function pickPlainPhrase(
    words: Array<{ word: string; start: number; end: number }>,
    index: number
  ): { start: number; end: number; nextIndex: number } {
    const maxWords = 4;
    let endIndex = index + 1;

    for (let i = index + 1; i < Math.min(words.length, index + maxWords); i++) {
      const previous = words[i - 1];
      const current = words[i];
      const gap = current.start - previous.end;
      if (gap > 3) break;

      const previousWord = previous.word.toLowerCase();
      const currentWord = current.word.toLowerCase();
      const shouldJoin =
        isPhraseConnector(currentWord) ||
        isPhraseConnector(previousWord) ||
        isCapitalizedPhrasePart(previous.word, current.word) ||
        (!shouldSkip(previousWord) && !shouldSkip(currentWord) && endIndex - index < 2);

      if (!shouldJoin) break;
      endIndex = i + 1;
    }

    return {
      start: words[index].start,
      end: words[endIndex - 1].end,
      nextIndex: endIndex,
    };
  }

  function isPhraseConnector(word: string): boolean {
    return PHRASE_CONNECTORS.has(word);
  }

  function isCapitalizedPhrasePart(previous: string, current: string): boolean {
    return /^[A-Z][A-Za-z'-]*$/.test(previous) && /^[A-Z][A-Za-z'-]*$/.test(current);
  }

  async function translateTextList(
    texts: string[],
    engine: 'google' | 'deepl' | 'bing',
    targetLang: string
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const batchSize = 40;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const source = batch.join('\n');
      try {
        const response = await handleFetchTranslation(source, 'en', targetLang, engine);
        const lines = response.targetText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        batch.forEach((text, index) => {
          const translated = lines[index];
          if (translated) result.set(text, translated);
        });
      } catch (err) {
        console.warn('[RTTR] 普通词批量翻译失败:', err);
      }
    }

    return result;
  }



  async function createSegmentCacheKey(text: string, model: string, targetLanguage: string): Promise<string> {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const data = new TextEncoder().encode(`${model}\n${targetLanguage}\n${normalized}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  async function readSegmentCache(key: string): Promise<AnnotationResult[] | null> {
    try {
      const stored = await browser.storage.local.get(PARAGRAPH_SEGMENT_CACHE_KEY);
      const cache = stored[PARAGRAPH_SEGMENT_CACHE_KEY] as Record<string, { ts: number; tokens: AnnotationResult[] }> | undefined;
      return cache?.[key]?.tokens || null;
    } catch {
      return null;
    }
  }

  async function writeSegmentCache(key: string, tokens: AnnotationResult[]): Promise<void> {
    try {
      const stored = await browser.storage.local.get(PARAGRAPH_SEGMENT_CACHE_KEY);
      const cache = (stored[PARAGRAPH_SEGMENT_CACHE_KEY] || {}) as Record<string, { ts: number; tokens: AnnotationResult[] }>;
      cache[key] = { ts: Date.now(), tokens };

      const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts);
      const trimmed = Object.fromEntries(entries.slice(0, MAX_SEGMENT_CACHE_ENTRIES));
      await browser.storage.local.set({ [PARAGRAPH_SEGMENT_CACHE_KEY]: trimmed });
    } catch (err) {
      console.warn('[RTTR] 分词缓存写入失败:', err);
    }
  }

  function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }



  // ─── AI 语境解释单词 ────────────────────────────────────
  async function handleExplainWord(word: string, sentence: string): Promise<{ success: boolean; explanation?: string; ipa?: string | null; error?: string }> {
    try {
      const settings = await settingsStorage.getValue();
      if (!settings.apiKey) {
        throw new Error('未配置 API Key');
      }
      
      const explanation = await explainWord(settings, word, sentence);
      const ipa = await getIpa(word);
      
      return {
        success: true,
        explanation,
        ipa
      };
    } catch (err: any) {
      console.error('[RTTR] 语境解释请求失败:', err);
      return { success: false, error: err.message };
    }
  }

  // ─── AI 极简语境翻译 ─────────────────────────────────────
  async function handleContextualTranslate(word: string, sentence: string): Promise<any> {
    try {
      const settings = await settingsStorage.getValue();
      if (!settings.apiKey) {
        throw new Error('未配置 API Key');
      }
      if (!settings.enabled) {
        throw new Error('RTTR 已禁用');
      }

      const translation = await contextualTranslate(settings, word, sentence);
      return { success: true, translation };
    } catch (error: any) {
      console.error('[RTTR] Contextual Translate failed:', error);
      return { success: false, error: error.message };
    }
  }

  async function handleReadNumber(numberText: string, sentence: string): Promise<any> {
    try {
      const settings = await settingsStorage.getValue();
      if (!settings.apiKey) {
        throw new Error('未配置 API Key');
      }
      if (!settings.enabled) {
        throw new Error('RTTR 已禁用');
      }

      const reading = await readNumberInContext(settings, numberText, sentence);
      return { success: true, reading };
    } catch (error: any) {
      console.error('[RTTR] Number reading failed:', error);
      return { success: false, error: error.message };
    }
  }
});
