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

import { translateParagraph } from '@/utils/ai';
import type { RTTRMessage, TranslateResponse, DismissWordResponse, UndismissWordResponse } from '@/utils/messaging';
import { settingsStorage, getKnownWordsSet, addKnownWord, removeKnownWord } from '@/utils/storage';
import { shouldSkip } from '@/utils/skip-words';

export default defineBackground(() => {
  console.log('[RTTR] Background service worker started', {
    id: browser.runtime.id,
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

        default:
          return false;
      }
    }
  );

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

    // 1. 调用 AI 全量翻译
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
});
