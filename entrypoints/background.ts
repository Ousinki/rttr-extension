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

import { translateParagraph, explainWord, contextualTranslate } from '@/utils/ai';
import { batchLookupIPA, getIpa } from '@/utils/phonetics';
import { handleFetchTranslation } from '@/utils/translator';
import type { RTTRMessage, TranslateResponse, DismissWordResponse, UndismissWordResponse, LookupIpaResponse } from '@/utils/messaging';
import { settingsStorage, getKnownWordsSet, addKnownWord, removeKnownWord } from '@/utils/storage';
import { shouldSkip } from '@/utils/skip-words';

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

        case 'DISMISS_WORD':
          handleDismissWord(message.word)
            .then(sendResponse)
            .catch(() =>
              sendResponse({ success: false } satisfies DismissWordResponse)
            );
          return true;

        case 'UNDISMISS_WORD':
          handleUndismissWord(message.word)
            .then(sendResponse)
            .catch(() =>
              sendResponse({ success: false } satisfies UndismissWordResponse)
            );
          return true;

        case 'GET_SETTINGS':
          settingsStorage.getValue().then(sendResponse);
          return true;

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

    // 0. 尝试命中缓存 (用户要求暂时注释掉本地化缓存)
    /*
    const textHash = Array.from(text).reduce((s, c) => Math.imul(31, s) + c.charCodeAt(0) | 0, 0);
    const cacheKey = `rttr_cache_${textHash}`;
    const cachedData = await browser.storage.local.get(cacheKey);
    let allResults: any[] = [];

    if (cachedData[cacheKey]) {
      console.log('[RTTR] Cache hit for paragraph');
      allResults = cachedData[cacheKey];
    } else {
      console.log('[RTTR] Cache miss, fetching from AI');
      // 1. 调用 AI 全量翻译
      allResults = await translateParagraph(text, settings);
      
      // 存入缓存，设置最多保留 1000 条记录以防无限膨胀
      await browser.storage.local.set({ [cacheKey]: allResults });
    }
    */
    
    // 1. 调用 AI 全量翻译（临时恢复直接调用）
    const allResults = await translateParagraph(text, settings);

    // 2. 过滤基础词汇（本地配置表，< 1ms）
    const afterSkip = allResults.filter(
      (item) => !shouldSkip(item.word)
    );

    // 3. 过滤无意义的翻译（原文和翻译相同且没有 explanation 的词）
    const meaningfulResults = afterSkip.filter(
      (item) => item.word.toLowerCase() !== item.translation.toLowerCase() || !!item.explanation
    );

    // 4. 过滤已知词（用户标记的词）
    const knownWords = await getKnownWordsSet();
    const filteredResults = meaningfulResults.filter(
      (item) => !knownWords.has(item.word.toLowerCase())
    );

    // 5. 并行查询音标（Free Dictionary API + 严式→宽式 KK 转换）
    //    此步骤与 AI 翻译异步并行，不阻塞主流程
    try {
      const wordsToLookup = filteredResults.map((item) => item.word);
      const ipaMap = await batchLookupIPA(wordsToLookup);
      for (const item of filteredResults) {
        const ipa = ipaMap.get(item.word);
        if (ipa) {
          item.ipa = ipa;
        }
      }
    } catch (err) {
      // 音标查询失败不影响翻译结果的返回
      console.warn('[RTTR] 音标查询失败，跳过:', err);
    }

    return {
      success: true,
      results: filteredResults,
    };
  }

  // ─── 标记已知词 ────────────────────────────────────────
  async function handleDismissWord(word: string): Promise<DismissWordResponse> {
    await addKnownWord(word);
    return { success: true };
  }

  // ─── 撤销标记已知词 ──────────────────────────────────────
  async function handleUndismissWord(word: string): Promise<UndismissWordResponse> {
    await removeKnownWord(word);
    return { success: true };
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
});
