/**
 * RTTR Content Script — 核心标注引擎
 *
 * 功能：
 * 1. 追踪鼠标悬浮的段落元素
 * 2. Alt+T 快捷键触发翻译
 * 3. 发送段落给 Background 进行 AI 翻译
 * 4. 将结果注入为 <ruby> 标注
 * 5. 点击标注词 → 标记为已知词
 */

import type { AnnotationResult } from '@/utils/ai';
import type { TranslateResponse, DismissWordResponse } from '@/utils/messaging';
import { settingsStorage, type RTTRSettings } from '@/utils/storage';
import { createWorker } from 'tesseract.js';

// ─── 常量 ────────────────────────────────────────────────

const RTTR_ATTR = 'data-rttr-annotated';
const RTTR_LOADING_ATTR = 'data-rttr-loading';

// 标注调色板 — 柔和但可区分的颜色
const ANNOTATION_COLORS = [
  '#5B9BD5', // 蓝
  '#70AD47', // 绿
  '#ED7D31', // 橙
  '#A855F7', // 紫
  '#44BEC7', // 青
  '#F472B6', // 粉
  '#FACC15', // 黄
  '#EF4444', // 红
  '#6366F1', // 靛蓝
  '#34D399', // 翡翠
  '#FB923C', // 琥珀
  '#C084FC', // 薰衣草
];
const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION']);

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main(ctx) {
    let hoveredElement: HTMLElement | null = null;
    let isDraggingRttrWord = false;
    let currentSettings: RTTRSettings | null = null;

    // 预热 TTS 引擎（解决首次点击发音慢的问题）
    document.addEventListener('pointerover', () => {
      if ('speechSynthesis' in window && window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.getVoices();
      }
    }, { once: true });

    // ─── 安全的消息发送（防止扩展重载后 runtime 断开） ────
    async function safeSendMessage(message: any): Promise<any> {
      try {
        if (!browser?.runtime?.id) {
          console.warn('[RTTR] 扩展上下文已失效，请刷新页面');
          return null;
        }
        return await browser.runtime.sendMessage(message);
      } catch (e: any) {
        if (e?.message?.includes('Extension context invalidated') ||
            e?.message?.includes('Cannot read properties of undefined')) {
          console.warn('[RTTR] 扩展上下文已失效，请刷新页面');
          return null;
        }
        throw e;
      }
    }

    // ─── 初始化并监听设置变化 ──────────────────────────────
    settingsStorage.getValue().then((val) => {
      currentSettings = val;
    });
    settingsStorage.watch((newVal) => {
      if (newVal) currentSettings = newVal;
    });

    // ─── 阻止拖拽残影飞回的动画 ──────────────────────────
    // 只有在我们自己的单词被拖拽时，才允许在全局任意位置放下，从而阻止浏览器默认的飞回动画
    document.addEventListener('dragover', (e) => {
      if (isDraggingRttrWord) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
      }
    });

    // ─── 注入样式 ──────────────────────────────────────
    injectStyles();

    // ─── 追踪鼠标悬浮元素 ──────────────────────────────
    document.addEventListener('mousemove', (e) => {
      hoveredElement = e.target as HTMLElement;
    });

    // ─── 监听快捷键（Alt+T） ───────────────────────────
    document.addEventListener('keydown', (e) => {
      if (currentSettings && !currentSettings.enabled) return;
      // macOS 上 Option+T 会产生 '†'，所以用 e.code 而非 e.key
      if (e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        handleTranslate(hoveredElement);
      }
    });

    // ─── 监听来自 Background 的命令（Chrome Commands API）
    browser.runtime.onMessage.addListener((message) => {
      if (currentSettings && !currentSettings.enabled) return;
      if (message.type === 'TRIGGER_TRANSLATE') {
        handleTranslate(hoveredElement);
      }
    });

    // ─── 全局点词发音 (Click-to-Pronounce) ────────────────
    // 点击页面上任何英文单词即可发音 + 显示音标，无需先 Alt+T
    let pronounceBadge: HTMLElement | null = null;
    let activeBadgeRect: DOMRect | null = null;
    let badgeMouseMoveHandler: ((e: MouseEvent) => void) | null = null;

    function getWordAtClick(e: MouseEvent): { word: string; range: Range } | null {
      // 如果点击的是 RTTR 标注过的单词，由它自己的 handler 处理
      const target = e.target as HTMLElement;
      // 如果点击的是右键菜单或双击悬浮窗的内部，不要关闭它们
      if (contextMenu && contextMenu.contains(target)) return null;
      if (explainPanel && explainPanel.contains(target)) return null;
      
      hideContextMenu();
      hideExplainPanel();

      if (tooltipEl && !target.closest('.rttr-word')) {hideTooltip();}
      
      // 不处理输入框等可编辑区域
      if (target.closest('input, textarea, [contenteditable="true"]')) return null;

      // 利用 caretRangeFromPoint 获取点击位置所在的文本节点
      let range: Range | null = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(e.clientX, e.clientY);
      }
      if (!range) return null;

      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return null;

      const text = node.textContent || '';
      const offset = range.startOffset;

      // 向前后扩展找到完整的英文单词边界
      let start = offset;
      let end = offset;
      while (start > 0 && /[a-zA-Z'-]/.test(text[start - 1])) start--;
      while (end < text.length && /[a-zA-Z'-]/.test(text[end])) end++;

      const word = text.slice(start, end).replace(/^['-]+|['-]+$/g, '');
      if (!word || word.length < 2 || !/^[a-zA-Z]/.test(word)) return null;

      // 构造包裹这个单词的 Range（用于定位弹窗）
      const wordRange = document.createRange();
      wordRange.setStart(node, start);
      wordRange.setEnd(node, end);

      const rect = wordRange.getBoundingClientRect();
      const pad = 6;
      if (
        e.clientX < rect.left - pad ||
        e.clientX > rect.right + pad ||
        e.clientY < rect.top - pad ||
        e.clientY > rect.bottom + pad
      ) {
        return null;
      }

      return { word, range: wordRange };
    }

    function showPronounceBadge(content: string, rect: DOMRect, isHTML = false) {
      if (!pronounceBadge) {
        pronounceBadge = document.createElement('div');
        pronounceBadge.id = 'rttr-pronounce-badge';
        document.body.appendChild(pronounceBadge);
      }
      if (isHTML) {
        pronounceBadge.innerHTML = content;
      } else {
        pronounceBadge.textContent = content;
      }
      pronounceBadge.classList.add('rttr-badge-visible');

      const x = rect.left + rect.width / 2;
      const y = rect.top + window.scrollY - 6;
      pronounceBadge.style.left = `${x}px`;
      pronounceBadge.style.top = `${y}px`;

      // 记录当前单词的可视区域，用于鼠标移出检测
      activeBadgeRect = rect;

      // 清除旧的 mousemove 监听器
      if (badgeMouseMoveHandler) {
        document.removeEventListener('mousemove', badgeMouseMoveHandler);
      }

      // 注册新的 mousemove 监听器：鼠标离开单词区域时隐藏徽章
      const PAD = 20; // 额外的宽容区域（像素），防止微小移动就触发消失
      badgeMouseMoveHandler = (e: MouseEvent) => {
        if (!activeBadgeRect) return;
        const inX = e.clientX >= activeBadgeRect.left - PAD && e.clientX <= activeBadgeRect.right + PAD;
        const inY = e.clientY >= activeBadgeRect.top - PAD && e.clientY <= activeBadgeRect.bottom + PAD;
        if (!inX || !inY) {
          hidePronounceBadge();
        }
      };
      document.addEventListener('mousemove', badgeMouseMoveHandler);
    }

    function hidePronounceBadge() {
      if (pronounceBadge) {
        pronounceBadge.classList.remove('rttr-badge-visible');
      }
      activeBadgeRect = null;
      if (badgeMouseMoveHandler) {
        document.removeEventListener('mousemove', badgeMouseMoveHandler);
        badgeMouseMoveHandler = null;
      }
    }

    // ─── 划词发音逻辑 ──────────────────────────────────────
    let lastSelectionText = '';
    let lastSelectionRect: DOMRect | null = null;
    let clickModeWaiting = false;

    async function showPronounceBadgeForSelection(text: string, rect: DOMRect) {
      const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
      
      if (!text.includes(' ') && text.length < 30) {
        try {
          const resp = await safeSendMessage({ type: 'LOOKUP_IPA', word: text }) as { ipa: string | null };
          if (resp?.ipa) {
            showPronounceBadge(resp.ipa, rect);
          } else {
            showPronounceBadge(speakerSVG, rect, true);
          }
        } catch {
          showPronounceBadge(speakerSVG, rect, true);
        }
      } else {
        showPronounceBadge(speakerSVG, rect, true);
      }
    }

    let clickTranslateWaiting = false; // 划词后点击选区翻译的等待标记

    // ─── 长按 AI 翻译状态 ──────────────────────────────────
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressRingTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressTarget: { type: 'selection' | 'word', text: string, rect: DOMRect, sentence: string } | null = null;
    let isLongPressFired = false;
    let startX = 0;
    let startY = 0;
    let longPressRing: HTMLDivElement | null = null;
    let originalSelectionRange: Range | null = null;

    function showLongPressRing(x: number, y: number) {
      if (longPressRing) hideLongPressRing();
      
      longPressRing = document.createElement('div');
      longPressRing.className = 'rttr-long-press-ring';
      longPressRing.style.left = `${x}px`;
      longPressRing.style.top = `${y}px`;
      
      longPressRing.innerHTML = `
        <svg viewBox="0 0 32 32">
          <circle class="ring-progress" cx="16" cy="16" r="14"></circle>
        </svg>
      `;
      
      document.body.appendChild(longPressRing);
      
      // 触发重绘以启动动画
      longPressRing.getBoundingClientRect();
      longPressRing.classList.add('active');
    }

    function hideLongPressRing(pop = false) {
      if (longPressRingTimer) {
        clearTimeout(longPressRingTimer);
        longPressRingTimer = null;
      }
      if (longPressRing) {
        if (pop) {
          longPressRing.classList.add('pop');
          const ring = longPressRing;
          setTimeout(() => {
            if (ring.parentNode) ring.parentNode.removeChild(ring);
          }, 200);
        } else {
          if (longPressRing.parentNode) longPressRing.parentNode.removeChild(longPressRing);
        }
        longPressRing = null;
      }
    }

    document.addEventListener('mousedown', (e) => {
      if (currentSettings && !currentSettings.enabled) return;
      if (e.button !== 0) return;
      
      isLongPressFired = false;
      longPressTarget = null;
      startX = e.clientX;
      startY = e.clientY;

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        originalSelectionRange = selection.getRangeAt(0).cloneRange();
      } else {
        originalSelectionRange = null;
      }

      let targetText = '';
      let targetRect: DOMRect | null = null;
      let sentence = '';
      let isSelection = false;

      // 检查是否在已有的选区上按下
      if (lastSelectionRect &&
          e.clientX >= lastSelectionRect.left && e.clientX <= lastSelectionRect.right &&
          e.clientY >= lastSelectionRect.top && e.clientY <= lastSelectionRect.bottom) {
        targetText = lastSelectionText;
        targetRect = lastSelectionRect;
        sentence = lastSelectionText; // 选区用其自身作为语境
        isSelection = true;
        
        // 阻止浏览器默认行为，防止在选区上按下鼠标瞬间选区（蓝色背景）消失
        e.preventDefault();
      } else {
        // 检查是否在单词上按下
        const result = getWordAtClick(e);
        if (result) {
          targetText = result.word;
          targetRect = result.range.getBoundingClientRect();
          // 如果获取不到 getSentenceAroundNode，就暂用整段文本
          sentence = (window as any).getSentenceAroundNode 
            ? (window as any).getSentenceAroundNode(result.range.startContainer) 
            : targetText;
        }
      }

      if (targetText && targetRect) {
        longPressTarget = { type: isSelection ? 'selection' : 'word', text: targetText, rect: targetRect, sentence };
        
        const longPressEnabled = currentSettings?.enableLongPressTranslate ?? true;
        if (longPressEnabled) {
          // 延迟 200ms 显示圆环，避免短按时闪烁
          longPressRingTimer = setTimeout(() => {
            showLongPressRing(e.clientX, e.clientY);
          }, 200);
          
          longPressTimer = setTimeout(() => {
            isLongPressFired = true;
            hideLongPressRing(true);
            
            if (longPressTarget) {
              const { text, rect, sentence } = longPressTarget;
              speakText(text);
              
              showTranslationBadge('AI 翻译中...', 'AI', rect, false);
              safeSendMessage({ type: 'CONTEXTUAL_TRANSLATE', word: text, sentence })
                .then((res: any) => {
                  if (res?.success && res.translation) {
                    showTranslationBadge(res.translation, 'AI', rect, false);
                  } else {
                    showTranslationBadge('翻译失败', 'AI', rect, false);
                  }
                }).catch(() => {
                  showTranslationBadge('翻译失败', 'AI', rect, false);
                });
            }
          }, 600);
        }
      }
    });

    document.addEventListener('mousemove', (e) => {
      // 只有移动超过 5px 才会取消长按（容差）
      if (longPressTimer && (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5)) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        hideLongPressRing(false);
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (currentSettings && !currentSettings.enabled) return;
      if (e.button !== 0) return;

      // 如果还没触发，清除长按定时器
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        hideLongPressRing(false);
      }

      if (isLongPressFired) {
        // 恢复长按前的选区状态（稍微延迟以覆盖浏览器的默认清除动作）
        if (originalSelectionRange && longPressTarget?.type === 'selection') {
          setTimeout(() => {
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(originalSelectionRange!);
            }
          }, 50);
        }
        // 已经长按过了，什么都不做
        return;
      }

      // 如果是一次选区上的短点击
      if (lastSelectionRect &&
          startX >= lastSelectionRect.left && startX <= lastSelectionRect.right &&
          startY >= lastSelectionRect.top && startY <= lastSelectionRect.bottom &&
          longPressTarget?.type === 'selection') {
        
        if (clickModeWaiting) {
          e.preventDefault();
          speakText(lastSelectionText);
          showPronounceBadgeForSelection(lastSelectionText, lastSelectionRect);
        }
        if (clickTranslateWaiting) {
          e.preventDefault();
          doFetchTranslationAndShowBadge(lastSelectionText, lastSelectionRect, false);
        }
        clickModeWaiting = false;
        clickTranslateWaiting = false;
        return;
      }

      clickModeWaiting = false;
      clickTranslateWaiting = false;

      // 正常的生成新选区逻辑
      setTimeout(() => {
        const autoEnabled = currentSettings?.enableAutoPronounce ?? true;
        const clickEnabled = currentSettings?.enableClickPronounce ?? false;
        const autoTranslate = currentSettings?.enableAutoTranslate ?? true;
        const clickTranslate = currentSettings?.enableClickTranslate ?? false;

        if (!autoEnabled && !clickEnabled && !autoTranslate && !clickTranslate) return;

        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : '';

        if (text && text.length > 0 && text.length < 200 && /^[a-zA-Z\s'-.,?!]+$/.test(text)) {
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            lastSelectionText = text;
            lastSelectionRect = rect;

            // TTS 发音逻辑
            if (autoEnabled) {
              speakText(text);
              showPronounceBadgeForSelection(text, rect);
            }
            clickModeWaiting = clickEnabled;

            // 翻译逻辑
            if (autoTranslate) {
              doFetchTranslationAndShowBadge(text, rect, false);
            }
            clickTranslateWaiting = clickTranslate;
          }
        } else {
          clickModeWaiting = false;
          clickTranslateWaiting = false;
          lastSelectionRect = null;
          lastSelectionText = '';
        }
      }, 10);
    });

    document.addEventListener('click', async (e) => {
      if (currentSettings && !currentSettings.enabled) return;
      if (isLongPressFired) {
        isLongPressFired = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const singleClickEnabled = currentSettings?.enableSingleClickPronounce ?? true;
      if (!singleClickEnabled) return;

      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      const result = getWordAtClick(e);
      if (!result) return;

      const { word, range } = result;
      const rect = range.getBoundingClientRect();

      // 1. 立即开始 TTS 朗读（不等音标返回）
      speakText(word);
      
      // 1.5. 触发翻译悬浮窗 (isAnnotated: false)
      doFetchTranslationAndShowBadge(word, rect, false);

      // 2. 通过 Background 的三层瀑布引擎查询音标 (如果开启了显示音标悬浮窗)
      if (currentSettings?.showSingleClickIPA !== false) {
        const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
        try {
          const resp = await safeSendMessage({ type: 'LOOKUP_IPA', word }) as { ipa: string | null };
          if (resp?.ipa) {
            showPronounceBadge(resp.ipa, rect);
          } else {
            showPronounceBadge(speakerSVG, rect, true);
          }
        } catch {
          showPronounceBadge(speakerSVG, rect, true);
        }
      }
    });

    // ─── 翻译处理函数 ──────────────────────────────────
    async function handleTranslate(target: HTMLElement | null) {
      if (!target) return;

      // 向上查找最近的块级元素
      const paragraph = findParagraph(target);
      if (!paragraph) {
        console.log('[RTTR] 未找到段落元素');
        return;
      }

      // 跳过已翻译的段落
      if (paragraph.hasAttribute(RTTR_ATTR)) {
        // 二次触发 → 清除标注
        clearAnnotations(paragraph);
        return;
      }

      // 跳过正在加载的段落
      if (paragraph.hasAttribute(RTTR_LOADING_ATTR)) return;

      const text = paragraph.innerText.trim();
      if (!text || text.length < 5) return;

      // 设置加载状态
      paragraph.setAttribute(RTTR_LOADING_ATTR, 'true');

      try {
        // 发送翻译请求到 Background
        const response = await safeSendMessage({
          type: 'TRANSLATE',
          text,
        }) as TranslateResponse;

        if (!response.success || !response.results) {
          throw new Error(response.error || '翻译失败');
        }

        // 注入 Ruby 标注
        applyAnnotations(paragraph, response.results);
      } catch (err) {
        console.error('[RTTR] 翻译错误:', err);
      } finally {
        paragraph.removeAttribute(RTTR_LOADING_ATTR);
      }
    }

    // ─── 查找段落元素 ──────────────────────────────────
    function findParagraph(el: HTMLElement | null): HTMLElement | null {
      while (el) {
        if (BLOCK_TAGS.has(el.tagName)) return el;
        el = el.parentElement;
      }
      return null;
    }

    // ─── 注入 Ruby 标注 ────────────────────────────────
    function applyAnnotations(
      paragraph: HTMLElement,
      results: AnnotationResult[]
    ) {
      // 保存原始 HTML 用于恢复
      paragraph.setAttribute('data-rttr-original', paragraph.innerHTML);
      paragraph.setAttribute(RTTR_ATTR, 'true');

      // 构建词汇映射（大小写不敏感），并分配颜色
      const wordMap = new Map<string, { translation: string; explanation?: string; pronunciation?: string; ipa?: string; color: string }>();
      results.forEach(({ word, translation, explanation, pronunciation, ipa }, i) => {
        wordMap.set(word.toLowerCase(), {
          translation,
          explanation,
          pronunciation,
          ipa,
          color: ANNOTATION_COLORS[i % ANNOTATION_COLORS.length],
        });
      });

      // 遍历文本节点并替换
      const walker = document.createTreeWalker(
        paragraph,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes: Text[] = [];
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        textNodes.push(node);
      }

      for (const textNode of textNodes) {
        const fragment = annotateTextNode(textNode, wordMap);
        if (fragment) {
          textNode.replaceWith(fragment);
        }
      }
    }

    // ─── 撤销栈管理 (Cmd+Z) ────────────────────────────
    interface UndoAction {
      wrapper: HTMLElement;
      textNode: Text;
      word: string;
    }
    const undoStack: UndoAction[] = [];

    document.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      // 如果焦点在输入框，忽略快捷键
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Cmd+Z (Mac) or Ctrl+Z (Windows) 撤销标记
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        const lastAction = undoStack.pop();
        if (lastAction) {
          e.preventDefault();
          undoDismiss(lastAction);
        }
        return;
      }

      // R 键划词发音
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'r') {
        const shortcutEnabled = currentSettings?.enableShortcutPronounce ?? true;
        if (!shortcutEnabled) return;

        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : '';
        if (text && text.length > 0 && text.length < 200 && /^[a-zA-Z\s'-.,?!]+$/.test(text)) {
          if (selection && selection.rangeCount > 0) {
            e.preventDefault();
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            clickModeWaiting = false;
            speakText(text);
            showPronounceBadgeForSelection(text, rect);
          }
        }
      }
    });

    async function undoDismiss(action: UndoAction) {
      const { wrapper, textNode, word } = action;
      try {
        const response = await safeSendMessage({
          type: 'UNDISMISS_WORD',
          word,
        }) as any;

        if (response?.success) {
          wrapper.classList.remove('rttr-dismissing');
          textNode.replaceWith(wrapper);
        } else {
          // 失败了放回栈中
          undoStack.push(action);
        }
      } catch (err) {
        console.error('[RTTR] AI 翻译请求失败:', err);
      }
    }

    // ─── 双击查词：语境 AI 解释面板 ─────────────────────────
    let explainPanel: HTMLElement | null = null;

    function getOrCreateExplainPanel(): HTMLElement {
      if (!explainPanel) {
        explainPanel = document.createElement('div');
        explainPanel.id = 'rttr-explain-panel';
        document.body.appendChild(explainPanel);
      }
      return explainPanel;
    }

    function showExplainPanelLoading(word: string, rect: DOMRect) {
      const panel = getOrCreateExplainPanel();
      panel.innerHTML = `
        <div class="rttr-ep-header">
          <span class="rttr-ep-word">${word}</span>
          <div class="rttr-ep-close">✕</div>
        </div>
        <div class="rttr-ep-divider"></div>
        <div class="rttr-ep-body rttr-ep-loading">
          <div class="rttr-ep-spinner"></div>
          正在解析语境和固定搭配...
        </div>
      `;
      positionExplainPanel(panel, rect);
      bindExplainPanelClose(panel);
    }

    function showExplainPanel(word: string, ipa: string | null, explanation: string, rect: DOMRect) {
      const panel = getOrCreateExplainPanel();
      const htmlContent = explanation
        .replace(/【语境含义】[：:]?\s*(.*?)(?=\n【|$)/g, '<div class="rttr-ep-section"><div class="rttr-ep-label">语境含义</div><div class="rttr-ep-text">$1</div></div>')
        .replace(/【固定搭配】[：:]?\s*(.*?)(?=\n【|$)/g, '<div class="rttr-ep-section"><div class="rttr-ep-label">固定搭配</div><div class="rttr-ep-text">$1</div></div>')
        .replace(/\n/g, '<br/>');

      panel.innerHTML = `
        <div class="rttr-ep-header">
          <span class="rttr-ep-word">${word}</span>
          ${ipa ? `<span class="rttr-ep-ipa">${ipa}</span>` : ''}
          <button class="rttr-ep-speak" aria-label="朗读">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
          </button>
          <div class="rttr-ep-close">✕</div>
        </div>
        <div class="rttr-ep-divider"></div>
        <div class="rttr-ep-body">
          ${htmlContent}
        </div>
      `;
      positionExplainPanel(panel, rect);
      bindExplainPanelClose(panel);

      const speakBtn = panel.querySelector('.rttr-ep-speak') as HTMLElement;
      if (speakBtn) {
        speakBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          speakText(word);
        });
      }
    }

    function positionExplainPanel(panel: HTMLElement, rect: DOMRect) {
      panel.classList.add('rttr-ep-visible');
      const panelRect = panel.getBoundingClientRect();
      const padding = 12;
      let top = rect.top + window.scrollY - panelRect.height - padding;
      let left = rect.left + window.scrollX + (rect.width / 2) - (panelRect.width / 2);

      if (top < window.scrollY + padding) {
        top = rect.bottom + window.scrollY + padding;
        panel.classList.add('rttr-ep-bottom');
      } else {
        panel.classList.remove('rttr-ep-bottom');
      }

      if (left < padding) left = padding;
      if (left + panelRect.width > window.innerWidth - padding) {
        left = window.innerWidth - panelRect.width - padding;
      }

      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
    }

    function hideExplainPanel() {
      if (explainPanel) {
        explainPanel.classList.remove('rttr-ep-visible');
      }
    }

    function bindExplainPanelClose(panel: HTMLElement) {
      const closeBtn = panel.querySelector('.rttr-ep-close') as HTMLElement;
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          hideExplainPanel();
        });
      }
    }

    function getSentenceAroundNode(node: Node): string {
      let block = node.parentElement;
      while (block && !BLOCK_TAGS.has(block.tagName)) {
        block = block.parentElement;
      }
      return block ? block.textContent?.trim() || '' : node.textContent || '';
    }

    /*
    document.addEventListener('dblclick', async (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.rttr-word')) return;
      if (target.closest('#rttr-explain-panel')) return;

      const result = getWordAtClick(e);
      if (!result) return;

      const { word, range } = result;
      const rect = range.getBoundingClientRect();
      const sentence = getSentenceAroundNode(range.startContainer);

      showExplainPanelLoading(word, rect);
      speakText(word);

      try {
        const resp = await safeSendMessage({
          type: 'EXPLAIN_WORD',
          word,
          sentence,
        }) as { success: boolean; explanation?: string; ipa?: string; error?: string };

        if (resp?.success && resp.explanation) {
          showExplainPanel(word, resp.ipa || null, resp.explanation, rect);
        } else {
          showExplainPanel(word, null, resp?.error || '解释获取失败', rect);
        }
      } catch (err) {
        showExplainPanel(word, null, '网络请求失败，请检查网络连接和 API Key', rect);
      }
    });
    */

    // ─── 自定义右键菜单逻辑 ────────────────────
    let contextMenu: HTMLElement | null = null;

    function getOrCreateContextMenu(): HTMLElement {
      if (!contextMenu) {
        contextMenu = document.createElement('div');
        contextMenu.id = 'rttr-context-menu';
        document.body.appendChild(contextMenu);
      }
      return contextMenu;
    }

    function hideContextMenu() {
      if (contextMenu) {
        contextMenu.classList.remove('rttr-cm-visible');
      }
    }

    const SVG_ICONS = {
      explain: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
      translate: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>',
      settings: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      dismiss: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
      speak: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>',
    };

    interface MenuItem {
      icon?: string;
      label: string;
      type?: 'header' | 'divider' | 'item';
      onClick?: () => void;
      onSpeakClick?: () => void;
    }

    function buildWordMenuItems(targetText: string, rectProvider: () => DOMRect, sentenceProvider: () => string): MenuItem[] {
      const items: MenuItem[] = [];

      if (!targetText.includes(' ') && targetText.length < 30) {
        items.push({
          type: 'header',
          label: targetText,
          onSpeakClick: () => speakText(targetText),
        });
        items.push({ type: 'divider', label: 'DIVIDER' });

        items.push({
          icon: SVG_ICONS.explain,
          label: '分析语境',
          onClick: () => {
            const rect = rectProvider();
            const sentence = sentenceProvider();
            showExplainPanelLoading(targetText, rect);
            speakText(targetText);
            safeSendMessage({ type: 'EXPLAIN_WORD', word: targetText, sentence })
              .then((resp: any) => {
                if (resp?.success && resp.explanation) {
                  showExplainPanel(targetText, resp.ipa || null, resp.explanation, rect);
                } else {
                  showExplainPanel(targetText, null, resp?.error || '解释获取失败', rect);
                }
              });
          },
        });
      } else {
        items.push({ type: 'header', label: targetText });
        items.push({ type: 'divider', label: 'DIVIDER' });
        items.push({ icon: SVG_ICONS.speak, label: '朗读选段', onClick: () => speakText(targetText) });
      }

      return items;
    }

    function showContextMenu(items: MenuItem[], x: number, y: number) {
      const menu = getOrCreateContextMenu();
      menu.innerHTML = '';
      
      items.forEach(item => {
        if (item.type === 'divider' || item.label === 'DIVIDER') {
          const divider = document.createElement('div');
          divider.className = 'rttr-cm-divider';
          menu.appendChild(divider);
          return;
        }

        if (item.type === 'header') {
          const el = document.createElement('div');
          el.className = 'rttr-cm-header';
          if (item.onSpeakClick) {
            el.classList.add('clickable');
            el.innerHTML = `<span class="rttr-cm-header-text">${item.label}</span><span class="rttr-cm-header-speak">${SVG_ICONS.speak}</span>`;
            el.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              el.classList.remove('rttr-speaking');
              void el.offsetWidth; // trigger reflow
              el.classList.add('rttr-speaking');
              setTimeout(() => el.classList.remove('rttr-speaking'), 2000);
              if (item.onSpeakClick) item.onSpeakClick();
            });
          } else {
            el.textContent = item.label;
          }
          menu.appendChild(el);
          return;
        }

        const el = document.createElement('div');
        el.className = 'rttr-cm-item';
        el.innerHTML = `<span class="rttr-cm-icon">${item.icon || ''}</span><span>${item.label}</span>`;
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideContextMenu();
          if (item.onClick) item.onClick();
        });
        menu.appendChild(el);
      });

      menu.classList.add('rttr-cm-visible');
      
      requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        let finalX = x;
        let finalY = y;
        const padding = 10;
        if (finalX + rect.width > window.innerWidth) {
          finalX = window.innerWidth - rect.width - padding;
        }
        if (finalY + rect.height > window.innerHeight) {
          finalY = window.innerHeight - rect.height - padding;
        }
        menu.style.left = `${finalX + window.scrollX}px`;
        menu.style.top = `${finalY + window.scrollY}px`;
      });
    }

    async function recognizeImageWord(img: HTMLImageElement, clientX: number, clientY: number, altText: string) {
      try {
        showContextMenu([
          { type: 'header', label: '⏳ Fetching image...' },
          { type: 'divider', label: 'DIVIDER' },
          { icon: SVG_ICONS.speak, label: '朗读备用描述', onClick: () => speakText(altText) },
          { type: 'divider', label: 'DIVIDER' },
          { icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) }
        ], clientX, clientY);

        let safeImg = img;
        try {
          // Check if canvas would be tainted
          const testCanvas = document.createElement('canvas');
          testCanvas.width = 1; testCanvas.height = 1;
          const testCtx = testCanvas.getContext('2d');
          testCtx?.drawImage(img, 0, 0, 1, 1);
          testCanvas.toDataURL(); 
        } catch (e) {
          // Tainted, fetch cross-origin base64 from background
          const res = await safeSendMessage({ type: 'FETCH_IMAGE_BASE64', url: img.src });
          if (res && res.base64) {
            safeImg = new Image();
            safeImg.src = res.base64;
            await new Promise((resolve) => { safeImg.onload = resolve; });
          } else {
            throw new Error("无法跨域获取图片数据");
          }
        }

        const rect = img.getBoundingClientRect();
        // Use the original image's natural dimensions for scale, not safeImg (which might vary if SVG or modified)
        const scaleX = safeImg.naturalWidth / rect.width;
        const scaleY = safeImg.naturalHeight / rect.height;

        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        // Crop size based on CSS pixels (to handle Retina/high-res images)
        const cssCropWidth = 400;
        const cssCropHeight = 150;
        let cropWidth = cssCropWidth * scaleX;
        let cropHeight = cssCropHeight * scaleY;

        // If the crop would cover most of the image, just use the full image
        const useFullImage = cropWidth >= safeImg.naturalWidth * 0.8 || cropHeight >= safeImg.naturalHeight * 0.8;
        if (useFullImage) {
          cropWidth = safeImg.naturalWidth;
          cropHeight = safeImg.naturalHeight;
        }

        const cropX = useFullImage ? 0 : Math.max(0, clickX - cropWidth / 2);
        const cropY = useFullImage ? 0 : Math.max(0, clickY - cropHeight / 2);

        console.log('[RTTR OCR] Image natural:', safeImg.naturalWidth, 'x', safeImg.naturalHeight, useFullImage ? '→ using FULL image' : '→ using crop');

        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const ctx = canvas.getContext('2d')!;
        if (!ctx) return;

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, cropWidth, cropHeight);
        ctx.drawImage(safeImg, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        // Preprocess: grayscale + adaptive binarization
        const imgData = ctx.getImageData(0, 0, cropWidth, cropHeight);
        const pixels = imgData.data;

        // Convert to grayscale first
        const gray = new Uint8Array(cropWidth * cropHeight);
        for (let i = 0; i < gray.length; i++) {
          gray[i] = Math.round(pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114);
        }

        // Calculate average brightness to determine if text is light-on-dark
        let sum = 0;
        for (let i = 0; i < gray.length; i++) sum += gray[i];
        const avgBrightness = sum / gray.length;

        console.log('[RTTR OCR] Avg brightness:', avgBrightness);

        // Helper: apply binarization to canvas with given inversion setting
        function applyBinarize(invert: boolean) {
          const d = ctx.getImageData(0, 0, cropWidth, cropHeight);
          const p = d.data;
          for (let i = 0; i < gray.length; i++) {
            let val = gray[i] > avgBrightness ? 255 : 0;
            if (invert) val = 255 - val;
            p[i * 4] = val;
            p[i * 4 + 1] = val;
            p[i * 4 + 2] = val;
          }
          ctx.putImageData(d, 0, 0);
          return canvas.toDataURL('image/png');
        }

        // Helper: extract words from Tesseract blocks
        function extractWords(data: any): any[] {
          const w: any[] = [];
          if (data.blocks) {
            for (const block of data.blocks) {
              if (block.paragraphs) {
                for (const para of block.paragraphs) {
                  if (para.lines) {
                    for (const line of para.lines) {
                      if (line.words) w.push(...line.words);
                    }
                  }
                }
              }
            }
          }
          return w;
        }

        console.log('[RTTR OCR] Target Point in Natural Image:', clickX, clickY);
        console.log('[RTTR OCR] Crop Origin:', cropX, cropY, 'Size:', cropWidth, cropHeight);

        showContextMenu([
          { type: 'header', label: '⏳ Recognizing...' },
          { type: 'divider', label: 'DIVIDER' },
          { icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) }
        ], clientX, clientY);

        const worker = await createWorker('eng');

        // Triple-pass OCR: 1) normal binarize, 2) inverted binarize, 3) original image
        let words: any[] = [];

        // Pass 1: binarize (dark text assumed)
        const img1 = applyBinarize(false);
        const r1 = await worker.recognize(img1, {}, { blocks: true });
        words = extractWords(r1.data);
        console.log('[RTTR OCR] Pass 1 (normal binarize):', words.length, 'words');

        // Pass 2: inverted binarize (light text on dark background)
        if (words.length === 0) {
          const img2 = applyBinarize(true);
          const r2 = await worker.recognize(img2, {}, { blocks: true });
          words = extractWords(r2.data);
          console.log('[RTTR OCR] Pass 2 (inverted binarize):', words.length, 'words');
        }

        // Pass 3: original unprocessed crop
        if (words.length === 0) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, cropWidth, cropHeight);
          ctx.drawImage(safeImg, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
          const img3 = canvas.toDataURL('image/png');
          const r3 = await worker.recognize(img3, {}, { blocks: true });
          words = extractWords(r3.data);
          console.log('[RTTR OCR] Pass 3 (original):', words.length, 'words');
        }

        await worker.terminate();

        const pointX = clickX - cropX;
        const pointY = clickY - cropY;
        
        console.log('[RTTR OCR] Mouse Point inside Crop:', pointX, pointY);
        console.log('[RTTR OCR] All recognized words:', words.map(w => ({text: w.text, bbox: w.bbox})));

        let targetWord = '';
        if (words.length > 0) {
          // Find the closest word to the click point by center-to-center distance
          let minDist = Infinity;
          let bestWord = '';
          for (const w of words) {
            const cx = (w.bbox.x0 + w.bbox.x1) / 2;
            const cy = (w.bbox.y0 + w.bbox.y1) / 2;
            const dist = Math.sqrt((pointX - cx) ** 2 + (pointY - cy) ** 2);
            // Only consider words within a reasonable range (half the word height)
            const wordHeight = w.bbox.y1 - w.bbox.y0;
            const maxDist = Math.max(wordHeight, 30 * scaleX);
            if (dist < minDist && dist < maxDist) {
              minDist = dist;
              bestWord = w.text.trim().replace(/[^a-zA-Z'-]/g, '');
            }
          }
          targetWord = bestWord;
        }

        if (targetWord) {
          showContextMenu([
            { type: 'header', label: targetWord, onSpeakClick: () => speakText(targetWord) },
            { type: 'divider', label: 'DIVIDER' },
            { icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) }
          ], clientX, clientY);
        } else {
          // Fallback: warning header + ALT text as readable item
          const items: any[] = [
            { type: 'header', label: 'No text detected' },
            { type: 'divider', label: 'DIVIDER' },
          ];
          if (altText && altText !== '图片没有可用描述') {
            items.push({ icon: SVG_ICONS.speak, label: altText, onClick: () => speakText(altText) });
            items.push({ type: 'divider', label: 'DIVIDER' });
          }
          items.push({ icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) });
          showContextMenu(items, clientX, clientY);
        }
      } catch (err) {
        console.error('Local OCR Error:', err);
        const items: any[] = [];
        if (altText && altText !== '图片没有可用描述') {
          items.push({ type: 'header', label: altText, onSpeakClick: () => speakText(altText) });
        } else {
          items.push({ type: 'header', label: 'OCR failed' });
        }
        items.push({ type: 'divider', label: 'DIVIDER' });
        items.push({ icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) });
        showContextMenu(items, clientX, clientY);
      }
    }

    document.addEventListener('contextmenu', async (e) => {
      const target = e.target as HTMLElement;

      const rttrWord = target.closest('.rttr-word') as HTMLElement;
      if (rttrWord) {
        e.preventDefault();
        const wordParts = Array.from(rttrWord.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'SPAN'))
          .map(n => n.textContent);
        const word = wordParts.join('');

        showContextMenu([
          { 
            type: 'header', 
            label: word, 
            onSpeakClick: () => {
              const event = new MouseEvent('click', { bubbles: true, cancelable: true });
              rttrWord.dispatchEvent(event);
            }
          },
          { type: 'divider', label: 'DIVIDER' },
          { icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) }
        ], e.clientX, e.clientY);
        return;
      }

      const imageTarget = target.closest('img') as HTMLImageElement | null;
      if (imageTarget) {
        e.preventDefault();
        const imageText =
          imageTarget.alt?.trim() ||
          imageTarget.title?.trim() ||
          imageTarget.getAttribute('aria-label')?.trim() ||
          imageTarget.dataset.title?.trim() ||
          imageTarget.dataset.description?.trim() ||
          '图片没有可用描述';

        showContextMenu([
          { type: 'header', label: '⏳ Recognizing...' },
          { type: 'divider', label: 'DIVIDER' },
          { icon: SVG_ICONS.speak, label: '朗读全图备用描述', onClick: () => speakText(imageText) },
          { type: 'divider', label: 'DIVIDER' },
          { icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) }
        ], e.clientX, e.clientY);

        recognizeImageWord(imageTarget, e.clientX, e.clientY, imageText).catch(console.error);
        return;
      }

      const selection = window.getSelection();
      let selectedText = selection ? selection.toString().trim() : '';
      let hoveredWordResult = getWordAtClick(e);
      
      if (selectedText || hoveredWordResult) {
        let targetText = '';
        let targetRange: Range | null = null;
        
        if (selectedText && selection && selection.rangeCount > 0) {
          const selRange = selection.getRangeAt(0);
          const rect = selRange.getBoundingClientRect();
          const isClickInSel = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
          if (isClickInSel) {
             targetText = selectedText;
             targetRange = selRange;
          }
        }
        
        if (!targetText && hoveredWordResult) {
           targetText = hoveredWordResult.word;
           targetRange = hoveredWordResult.range;
        }

        if (targetText && targetRange && /^[a-zA-Z\s'-]+$/.test(targetText)) {
          e.preventDefault();
          
          const items = buildWordMenuItems(
            targetText,
            () => targetRange!.getBoundingClientRect(),
            () => getSentenceAroundNode(targetRange!.startContainer)
          );
          
          items.push({
            icon: SVG_ICONS.translate, label: '翻译段落', onClick: () => {
              handleTranslate(targetRange!.startContainer.parentElement);
            }
          });
          
          items.push({ type: 'divider', label: 'DIVIDER' });
          items.push({ icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) });

          showContextMenu(items, e.clientX, e.clientY);
          return;
        }
      }
    });

    // ─── 全局悬浮窗管理 ────────────────────────────────
    let tooltipEl: HTMLElement | null = null;
    let currentUtterance: SpeechSynthesisUtterance | null = null; // 防止 Chrome GC 导致语音中断

    function getOrCreateTooltip(): HTMLElement {
      if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'rttr-global-tooltip';
        document.body.appendChild(tooltipEl);
      }
      return tooltipEl;
    }

    function showTooltip(text: string, rect: DOMRect) {
      const el = getOrCreateTooltip();
      el.textContent = text;
      
      // 先加上 class 以获取实际渲染尺寸
      el.classList.add('rttr-visible');
      
      // 恢复原有的 -8px，避免普通标注显得太远
      const top = window.scrollY + rect.top - 8;
      const left = window.scrollX + rect.left + (rect.width / 2);
      
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
      el.style.transform = 'translate(-50%, -100%) scale(0.95)';
    }

    function hideTooltip() {
      if (tooltipEl) {
        tooltipEl.classList.remove('rttr-visible');
      }
    }

    // ─── 独立翻译悬浮窗逻辑 ──────────────────────────────
    let translationBadge: HTMLElement | null = null;
    let transMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
    let activeTransRect: DOMRect | null = null;

    function showTranslationBadge(text: string, engine: string, targetRect: DOMRect, isAnnotated: boolean) {
      if (!translationBadge) {
        translationBadge = document.createElement('div');
        translationBadge.className = 'rttr-translation-tooltip';
        document.body.appendChild(translationBadge);
      }
      
      const safeEngine = engine.charAt(0).toUpperCase() + engine.slice(1);
      
      if (currentSettings?.showTranslationEngine !== false) {
        translationBadge.innerHTML = `<strong>${text}</strong><span class="engine-tag">${safeEngine}</span>`;
      } else {
        translationBadge.innerHTML = `<strong>${text}</strong>`;
      }
      
      translationBadge.classList.add('rttr-visible');

      // 决定位置：根据用户在设置中选择的悬浮窗位置 (默认下方)
      let posClass = currentSettings?.translationPosition === 'top' ? 'pos-top' : 'pos-bottom';
      translationBadge.classList.remove('pos-top', 'pos-bottom');
      translationBadge.classList.add(posClass);

      const x = targetRect.left + targetRect.width / 2;
      let y = window.scrollY;
      
      if (posClass === 'pos-top') {
        // 在上方：如果目标本身是一个 <ruby>，它的边界可能已经包含了上方的拼音。
        // 如果启用了音标悬浮窗，为了避开音标框，需要向上偏移更多
        if (currentSettings?.showSingleClickIPA !== false) {
          y += targetRect.top - 46;
        } else {
          y += targetRect.top - 12;
        }
      } else {
        // 在下方
        y += targetRect.bottom + 12;
      }

      translationBadge.style.left = `${x}px`;
      translationBadge.style.top = `${y}px`;

      activeTransRect = targetRect;

      if (transMouseMoveHandler) {
        document.removeEventListener('mousemove', transMouseMoveHandler);
      }

      // 距离稍大一点，防止离开
      const PAD = 30;
      transMouseMoveHandler = (e: MouseEvent) => {
        if (!activeTransRect) return;
        const inX = e.clientX >= activeTransRect.left - PAD && e.clientX <= activeTransRect.right + PAD;
        const inY = e.clientY >= activeTransRect.top - PAD && e.clientY <= activeTransRect.bottom + PAD;
        if (!inX || !inY) {
          hideTranslationBadge();
        }
      };
      document.addEventListener('mousemove', transMouseMoveHandler);
    }

    function hideTranslationBadge() {
      if (translationBadge) {
        translationBadge.classList.remove('rttr-visible');
      }
      activeTransRect = null;
      if (transMouseMoveHandler) {
        document.removeEventListener('mousemove', transMouseMoveHandler);
        transMouseMoveHandler = null;
      }
    }

    async function doFetchTranslationAndShowBadge(text: string, targetRect: DOMRect, isAnnotated: boolean) {
      const engine = currentSettings?.translationEngine || 'google';
      if (engine === 'none') return; // 如果选择了不启用，则直接返回，不发起翻译请求

      try {
        const resp = await safeSendMessage({
          type: 'FETCH_TRANSLATION',
          text,
          sourceLang: 'auto',
          targetLang: navigator.language.startsWith('zh') ? 'zh-CN' : 'zh-TW',
          engine
        }) as any;

        if (resp && resp.targetText) {
          showTranslationBadge(resp.targetText, resp.engine || engine, targetRect, isAnnotated);
        }
      } catch (e) {
        console.error('[RTTR] Translation fetch error:', e);
      }
    }

    // ─── 语音合成 (TTS) ────────────────────────────────
    function speakText(text: string, onComplete?: () => void) {
      console.log(`[RTTR TTS] 准备朗读文本: "${text}"`);
      if (!('speechSynthesis' in window)) {
        console.error('[RTTR TTS] 当前浏览器不支持 speechSynthesis');
        return;
      }
      const playVoice = () => {
        const utterance = new SpeechSynthesisUtterance(text);
        
        if (currentSettings) {
          utterance.lang = currentSettings.ttsLanguage || 'en-US';
          utterance.rate = currentSettings.ttsRate || 0.85;
          utterance.volume = currentSettings.ttsVolume ?? 1.0;
          
          const voices = window.speechSynthesis.getVoices();
          console.log(`[RTTR TTS] 当前系统可用声音数量: ${voices.length}`);
          
          const voiceURI = currentSettings.ttsVoiceURI;
          if (voiceURI) {
            console.log(`[RTTR TTS] 用户配置了指定发音人 URI: ${voiceURI}`);
            const selectedVoice = voices.find(v => v.voiceURI === voiceURI);
            if (selectedVoice) {
              utterance.voice = selectedVoice;
              console.log(`[RTTR TTS] 成功匹配发音人: ${selectedVoice.name}`);
            } else {
              console.warn(`[RTTR TTS] 未找到指定的发音人，将使用系统默认`);
            }
          } else {
            console.log(`[RTTR TTS] 用户未配置发音人，尝试匹配 Google US English`);
            const googleVoice = voices.find(v => v.name.includes('Google US English'));
            if (googleVoice) {
              utterance.voice = googleVoice;
              console.log(`[RTTR TTS] 成功匹配到 Google US English`);
            } else {
              console.warn(`[RTTR TTS] 未找到 Google US English，将使用系统默认`);
            }
          }
        } else {
          console.warn(`[RTTR TTS] currentSettings 为空，使用兜底配置`);
          utterance.lang = 'en-US';
          utterance.rate = 0.85;
        }
        
        utterance.onstart = () => console.log('[RTTR TTS] 开始朗读...');
        utterance.onend = () => {
          console.log('[RTTR TTS] 朗读结束.');
          if (onComplete) onComplete();
        };
        utterance.onerror = (e) => {
          if (e.error === 'interrupted') {
            // 正常打断，不作为错误抛出
            console.log('[RTTR TTS] 朗读已切换/被打断');
          } else {
            console.error('[RTTR TTS] 朗读发生错误, 原因:', e.error);
          }
          if (onComplete) onComplete();
        };

        currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
      };

      // 仅当当前有正在播放或等待播放的语音时，才执行 cancel 和延迟
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
        setTimeout(playVoice, 10);
      } else {
        // 引擎空闲时，零延迟立刻发音
        playVoice();
      }
    }

    // ─── 标注单个文本节点 ──────────────────────────────
    function annotateTextNode(
      textNode: Node,
      wordMap: Map<string, { translation: string; explanation?: string; pronunciation?: string; ipa?: string; color: string }>
    ): DocumentFragment | null {
      const text = textNode.textContent || '';
      if (!text.trim()) return null;

      // 构建正则：按词长降序匹配（优先匹配 small-scale 而非 small）
      const escapedWords = Array.from(wordMap.keys())
        .sort((a, b) => b.length - a.length)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

      if (escapedWords.length === 0) return null;

      const pattern = new RegExp(`(\\b(?:${escapedWords.join('|')})\\b)`, 'gi');
      const parts = text.split(pattern);

      if (parts.length <= 1) return null; // 没有匹配

      let hasAnnotation = false;
      const fragment = document.createDocumentFragment();

      for (const part of parts) {
        const lower = part.toLowerCase();
        const entry = wordMap.get(lower);

        if (entry) {
          const isSameTranslation = part.toLowerCase() === entry.translation.toLowerCase();

          // 统一使用 ruby，哪怕翻译和原文一样，我们把 rt 置空即可（点击时仍可显示音标）
          let wrapper = document.createElement('ruby');
          wrapper.className = 'rttr-word';
          wrapper.style.color = entry.color;
          
          // 如果包含多个单词，将每个单词用 span 包裹，以便点击时能精确获知点击了哪个词
          const subWords = part.split(/(\s+)/);
          subWords.forEach((subWord, idx) => {
            if (subWord.trim()) {
              const span = document.createElement('span');
              span.textContent = subWord;
              // 记录实义词的索引（忽略空格元素）
              span.dataset.idx = String(Math.floor(idx / 2));
              wrapper.appendChild(span);
            } else {
              wrapper.appendChild(document.createTextNode(subWord));
            }
          });

          if (entry.explanation) {
            wrapper.dataset.explanation = entry.explanation;
            wrapper.classList.add('rttr-has-tooltip');
          }

          const rt = document.createElement('rt');
          rt.className = 'rttr-translation';
          rt.style.color = entry.color;
          // 如果翻译等于原文，就不默认显示翻译（但 rt 占位留着，以便点击时闪现音标）
          rt.textContent = isSameTranslation ? '' : entry.translation;

          wrapper.appendChild(rt);

          // 悬浮窗事件
          if (entry.explanation) {
            wrapper.addEventListener('mouseenter', (e) => {
              const target = e.currentTarget as HTMLElement;
              showTooltip(target.dataset.explanation || '', target.getBoundingClientRect());
            });
            wrapper.addEventListener('mouseleave', () => {
              hideTooltip();
            });
          }

          // 点击标注 → 朗读 (TTS) + 显示音标
          wrapper.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const target = e.target as HTMLElement;
            // 默认朗读整个短语
            let textToSpeak = entry.pronunciation || part;
            let ipaToShow = entry.ipa || '';

            if (target.tagName === 'SPAN' && target.dataset.idx) {
              const wordIdx = parseInt(target.dataset.idx, 10);
              
              // 拆分音标（去除头尾斜杠后按空格拆分）
              if (ipaToShow) {
                const cleanIpa = ipaToShow.replace(/^\/|\/$/g, '').trim();
                const ipaParts = cleanIpa.split(/\s+/);
                // 确保英文单词数和音标块数一致才进行精确匹配
                const wordCount = part.trim().split(/\s+/).length;
                if (ipaParts.length === wordCount && ipaParts[wordIdx]) {
                  ipaToShow = `/${ipaParts[wordIdx]}/`;
                  textToSpeak = target.textContent || textToSpeak;
                } else {
                  ipaToShow = '';
                  textToSpeak = target.textContent || textToSpeak;
                }
              } else {
                textToSpeak = target.textContent || textToSpeak;
              }
            }

            // 立即开始发音，不被音标查询阻塞
            speakText(textToSpeak);
            
            // 触发翻译悬浮窗 (isAnnotated: true)
            doFetchTranslationAndShowBadge(textToSpeak, target.getBoundingClientRect(), true);

            const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';

            if (ipaToShow) {
              showPronounceBadge(ipaToShow, target.getBoundingClientRect());
            } else {
              const singleWord = textToSpeak.trim();
              if (!singleWord.includes(' ') && /^[a-zA-Z'-]+$/.test(singleWord)) {
                try {
                  const resp = await safeSendMessage({ type: 'LOOKUP_IPA', word: singleWord }) as { ipa: string | null };
                  if (resp?.ipa) {
                    showPronounceBadge(resp.ipa, target.getBoundingClientRect());
                    // 缓存回 entry 供后续点击复用（只针对整个短语点击时缓存）
                    if (textToSpeak === (entry.pronunciation || part)) {
                      entry.ipa = resp.ipa;
                    }
                    return;
                  }
                } catch {
                  // 静默失败
                }
              }
              showPronounceBadge(speakerSVG, target.getBoundingClientRect(), true);
            }
          });

          // 拖拽标注 → 标记为已知词 (扔掉)
          // 动态设置 draggable：默认 false 不干扰全局文本划选，仅在按住单词时设为 true
          wrapper.addEventListener('mousedown', () => {
            wrapper.draggable = true;
          });
          wrapper.addEventListener('mouseup', () => {
            wrapper.draggable = false;
          });
          wrapper.addEventListener('dragend', () => {
            wrapper.draggable = false;
          });

          let dragStartX = 0;
          let dragStartY = 0;

          wrapper.addEventListener('dragstart', (e) => {
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            isDraggingRttrWord = true;

            if (entry.explanation) hideTooltip();
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', part);
              
              // 解决拖拽残影被截断和错位的问题：用一个有 padding 的 div 包裹，保持 clone 原始行内渲染
              const dragImageContainer = document.createElement('div');
              dragImageContainer.style.position = 'absolute';
              dragImageContainer.style.top = '-10000px';
              dragImageContainer.style.left = '-10000px';
              dragImageContainer.style.padding = '20px'; // 提供足够的空间防止截断
              dragImageContainer.style.backgroundColor = 'transparent';
              
              const clone = wrapper.cloneNode(true) as HTMLElement;
              clone.classList.remove('rttr-is-dragging'); // 确保残影是全彩的
              dragImageContainer.appendChild(clone);
              
              document.body.appendChild(dragImageContainer);
              
              // 确保拖拽残影和鼠标抓取位置对齐
              const rect = wrapper.getBoundingClientRect();
              const offsetX = e.clientX - rect.left;
              const offsetY = e.clientY - rect.top;
              e.dataTransfer.setDragImage(dragImageContainer, 20 + offsetX, 20 + offsetY);
              
              // 用完后清理掉
              setTimeout(() => {
                dragImageContainer.remove();
              }, 0);
            }
            // 延迟一点点添加类名
            setTimeout(() => {
              wrapper.classList.add('rttr-is-dragging');
              // 刚开始拖拽时，默认就在原地，所以直接加上吸附状态
              wrapper.classList.add('rttr-will-snap-back');
            }, 0);
          });

          // 拖拽过程中的实时反馈（磁吸效果判定）
          wrapper.addEventListener('drag', (e) => {
            if (e.clientX === 0 && e.clientY === 0) return; // 忽略部分浏览器在 drag 结束时触发的 (0,0) 坐标

            const distance = Math.sqrt(
              Math.pow(e.clientX - dragStartX, 2) + 
              Math.pow(e.clientY - dragStartY, 2)
            );

            // 距离小于 30 像素时，触发原位置的“吸附/点亮”反馈
            if (distance <= 30) {
              wrapper.classList.add('rttr-will-snap-back');
            } else {
              wrapper.classList.remove('rttr-will-snap-back');
            }
          });

          wrapper.addEventListener('dragend', (e) => {
            e.preventDefault();
            isDraggingRttrWord = false;
            wrapper.classList.remove('rttr-is-dragging');
            wrapper.classList.remove('rttr-will-snap-back');
            
            // 如果放回了原地（拖拽距离小于 30 像素），则不做处理
            const distance = Math.sqrt(
              Math.pow(e.clientX - dragStartX, 2) + 
              Math.pow(e.clientY - dragStartY, 2)
            );
            
            if (distance > 30) {
              dismissWord(wrapper, lower, part);
            }
          });

          fragment.appendChild(wrapper);
          hasAnnotation = true;
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      }

      return hasAnnotation ? fragment : null;
    }

    // ─── 取消标注（标记为已知词） ──────────────────────
    async function dismissWord(ruby: HTMLElement, word: string, originalText: string) {
      // 动画淡出
      ruby.classList.add('rttr-dismissing');

      try {
        const response = await safeSendMessage({
          type: 'DISMISS_WORD',
          word,
        }) as DismissWordResponse;

        if (response.success) {
          // 替换 ruby 为纯文本
          setTimeout(() => {
            const textNode = document.createTextNode(originalText);
            ruby.replaceWith(textNode);
            
            // 加入撤销栈
            undoStack.push({ wrapper: ruby, textNode, word });
            if (undoStack.length > 50) undoStack.shift(); // 限制最多50步
          }, 300);
        }
      } catch (err) {
        console.error('[RTTR] 标记已知词失败:', err);
        ruby.classList.remove('rttr-dismissing');
      }
    }

    // ─── 清除段落标注 ──────────────────────────────────
    function clearAnnotations(paragraph: HTMLElement) {
      const original = paragraph.getAttribute('data-rttr-original');
      if (original) {
        paragraph.innerHTML = original;
      }
      paragraph.removeAttribute(RTTR_ATTR);
      paragraph.removeAttribute('data-rttr-original');
    }

    // ─── 注入样式 ──────────────────────────────────────
    function injectStyles() {
      const style = document.createElement('style');
      style.id = 'rttr-injected-styles';
      style.textContent = `
        /* ─── RTTR Ruby 标注样式 ─── */
        .rttr-word {
          color: var(--rttr-color, #4a90d9);
          cursor: text;
          position: relative;
          transition: opacity 0.3s ease, color 0.2s ease;
          user-select: text !important;
          -webkit-user-select: text !important;
        }

        /* 强制选中状态有背景色，防止因为可拖拽属性或行内块导致无选中反馈 */
        .rttr-word::selection,
        .rttr-word *::selection {
          background-color: #b3d4fc !important;
          color: #000 !important;
        }

        .rttr-word:hover {
          color: var(--rttr-color-hover, #2a70b9);
        }

        /* 带有悬浮窗解释的词 */
        span.rttr-tooltip-only, ruby.rttr-has-tooltip {
          border-bottom: 1px dashed currentColor;
        }

        ruby.rttr-word rt.rttr-translation {
          cursor: pointer;
          font-size: 0.55em;
          color: inherit;
          opacity: 0.85;
          font-weight: 400;
          letter-spacing: 0;
          line-height: 1;
          padding: 0;
          text-align: center;
          ruby-align: center;
          user-select: none;
          -webkit-user-select: none;
          /* 将上标稍微往下移一点，靠近底部的英文，防止撞到上一行 */
          transform: translateY(0.15em);
          transition: all 0.2s ease; /* 增加平滑过渡效果 */
        }

        ruby.rttr-word.rttr-playing-ipa rt.rttr-translation {
          font-size: 0.8em;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: #3282ff !important;
          opacity: 1;
          transform: translateY(0); /* 字体变大时恢复标准位置 */
        }

        /* 强制给包含标注的段落增加一点行高，防止拥挤 */
        [data-rttr-annotated="true"] {
          line-height: 1.8 !important;
        }

        ruby.rttr-word:hover rt.rttr-translation {
          opacity: 1;
        }

        /* 取消标注动画 */
        .rttr-word.rttr-dismissing {
          opacity: 0;
          transform: scale(0.95);
          transition: all 0.3s ease;
        }

        /* 长按加载动画环 */
        .rttr-long-press-ring {
          position: fixed;
          pointer-events: none;
          z-index: 2147483647;
          width: 32px;
          height: 32px;
          margin-left: -16px;
          margin-top: -16px;
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .rttr-long-press-ring.active {
          opacity: 1;
        }
        .rttr-long-press-ring svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }
        .rttr-long-press-ring .ring-progress {
          fill: transparent;
          stroke: var(--rttr-color, #4a90d9);
          stroke-width: 4;
          stroke-linecap: round;
          stroke-dasharray: 87.96; /* 2 * pi * 14 */
          stroke-dashoffset: 87.96;
          opacity: 0.6;
          transition: stroke-dashoffset 400ms linear;
        }
        .rttr-long-press-ring.active .ring-progress {
          stroke-dashoffset: 0;
        }
        .rttr-long-press-ring.pop {
          transform: scale(1.15);
          opacity: 0;
          transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease-out;
        }

        /* 拖拽中留在原地的词：变成一个具有物理感的凹陷“空槽” (Empty Dropzone Slot) */
        .rttr-word.rttr-is-dragging {
          color: transparent !important; /* 彻底隐藏原本的文字，仿佛被拿走了 */
          background-color: rgba(0, 0, 0, 0.04); /* 浅灰底色 */
          border-radius: 4px;
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.1); /* 内阴影制造物理凹陷感 */
          outline: 1.5px dashed rgba(0, 0, 0, 0.2); /* 虚线框暗示这是个槽位 */
          outline-offset: 2px;
          transition: all 0.2s ease;
          cursor: grabbing !important;
        }
        
        .rttr-word.rttr-is-dragging rt.rttr-translation {
          color: transparent !important;
        }

        .rttr-word.rttr-is-dragging * {
          cursor: grabbing !important;
        }
        
        /* 原地吸附的准备状态（拖拽回原位附近）：插槽感应发光 (Magnetic Glow) */
        .rttr-word.rttr-will-snap-back {
          background-color: rgba(74, 144, 217, 0.1) !important;
          outline: 2px dashed rgba(74, 144, 217, 0.9) !important;
          outline-offset: 3px !important;
          box-shadow: inset 0 0 6px rgba(74, 144, 217, 0.2), 0 0 12px rgba(74, 144, 217, 0.4) !important; /* 内外双重发光 */
          transform: scale(1.04); /* 整体轻微放大，准备迎接吸附 */
          transition: all 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28); /* Q弹动画 */
        }

        /* ─── 悬浮窗样式 (Premium UI) ─── */
        #rttr-global-tooltip {
          visibility: hidden;
          opacity: 0;
          transform: translateY(4px) scale(0.98);
          position: absolute;
          z-index: 2147483647; /* MAX Z-INDEX */
          background: rgba(28, 28, 30, 0.95);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #f5f5f7;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.5;
          letter-spacing: 0.02em;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.08);
          pointer-events: none;
          white-space: pre-wrap;
          max-width: 280px;
          text-align: center;
          font-family: system-ui, -apple-system, sans-serif;
          transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), 
                      transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      visibility 0.2s;
        }

        #rttr-global-tooltip.rttr-visible {
          visibility: visible;
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        
        /* 底部的小三角 */
        #rttr-global-tooltip::after {
          content: '';
          position: absolute;
          bottom: -5px;
          left: 50%;
          margin-left: -5px;
          border-width: 5px 5px 0 5px;
          border-style: solid;
          border-color: rgba(28, 28, 30, 0.95) transparent transparent transparent;
        }

        /* ─── 独立翻译悬浮窗 (Translation Tooltip) ─── */
        .rttr-translation-tooltip {
          position: absolute;
          background-color: #f0f0f0; /* 偏灰一点，不要太暗 */
          color: #333333;
          border: 1px solid #dcdcdc;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          padding: 6px 10px;
          font-size: 14px;
          z-index: 2147483647;
          border-radius: 0px; /* 直角矩形 */
          pointer-events: none;
          white-space: pre-wrap;
          width: max-content;
          max-width: 300px;
          font-family: system-ui, -apple-system, sans-serif;
          
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: left;
          gap: 8px;
          
          /* 初始动画状态 */
          opacity: 0;
          transition: opacity 0.2s ease-out, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .rttr-translation-tooltip.rttr-visible {
          opacity: 1;
        }

        /* 位置 1：显示在最上方（含初始微小位移） */
        .rttr-translation-tooltip.pos-top {
          transform: translate(-50%, 8px);
        }
        .rttr-translation-tooltip.pos-top.rttr-visible {
          transform: translate(-50%, 0);
        }

        /* 位置 2：显示在最下方（含初始微小位移） */
        .rttr-translation-tooltip.pos-bottom {
          transform: translate(-50%, -8px);
        }
        .rttr-translation-tooltip.pos-bottom.rttr-visible {
          transform: translate(-50%, 0);
        }

        /* 翻译引擎标识标签 */
        .rttr-translation-tooltip .engine-tag {
          font-size: 10px;
          color: #888;
          border-left: 1px solid #ccc;
          padding-left: 8px;
          line-height: 1;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* 加载指示器 — 行末旋转圆环 */
        [data-rttr-loading="true"] {
          opacity: 0.5;
          transition: opacity 0.2s ease;
        }

        [data-rttr-loading="true"]::after {
          content: '';
          display: inline-block;
          width: 14px;
          height: 14px;
          margin-left: 6px;
          vertical-align: middle;
          border: 2px solid rgba(150, 150, 150, 0.25);
          border-top-color: #999;
          border-radius: 50%;
          animation: rttr-spin 0.7s linear infinite;
        }

        @keyframes rttr-spin {
          to { transform: rotate(360deg); }
        }

        /* ─── 全局点词发音徽章 ─── */
        #rttr-pronounce-badge {
          position: absolute;
          z-index: 2147483647;
          background: rgba(28, 28, 30, 0.92);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: #7eb8ff;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13px;
          font-weight: 500;
          padding: 3px 10px;
          border-radius: 6px;
          box-shadow: 0 3px 12px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.06);
          pointer-events: none;
          white-space: nowrap;
          transform: translate(-50%, -100%) scale(0.9);
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
        }

        #rttr-pronounce-badge.rttr-badge-visible {
          opacity: 1;
          visibility: visible;
          transform: translate(-50%, -100%) scale(1);
        }

        #rttr-pronounce-badge::after {
          content: '';
          position: absolute;
          bottom: -4px;
          left: 50%;
          margin-left: -4px;
          border-width: 4px 4px 0 4px;
          border-style: solid;
          border-color: rgba(28, 28, 30, 0.92) transparent transparent transparent;
        }

        /* ─── AI 双击解释悬浮窗 ─── */
        #rttr-explain-panel {
          position: absolute;
          z-index: 2147483647;
          width: 320px;
          background: #fdfaf5; /* 欧路牛皮纸底色 */
          border: 1px solid rgba(140, 120, 80, 0.2);
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(90, 70, 40, 0.15), 0 2px 10px rgba(90, 70, 40, 0.05);
          font-family: system-ui, -apple-system, 'PingFang SC', sans-serif;
          opacity: 0;
          visibility: hidden;
          transform: translateY(8px) scale(0.98);
          transform-origin: bottom center;
          transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      visibility 0.2s;
          pointer-events: auto;
        }

        #rttr-explain-panel.rttr-ep-bottom {
          transform-origin: top center;
          transform: translateY(-8px) scale(0.98);
        }

        #rttr-explain-panel.rttr-ep-visible {
          opacity: 1;
          visibility: visible;
          transform: translateY(0) scale(1);
        }

        .rttr-ep-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 16px 8px;
        }

        .rttr-ep-word {
          font-size: 18px;
          font-weight: 700;
          color: #2c1e0f;
          letter-spacing: 0.01em;
        }

        .rttr-ep-speak {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          background: rgba(160, 130, 80, 0.12);
          border-radius: 6px;
          color: #8b6914;
          cursor: pointer;
          transition: background 0.15s;
          flex-shrink: 0;
        }

        .rttr-ep-speak:hover {
          background: rgba(160, 130, 80, 0.25);
        }

        .rttr-ep-speak:active {
          transform: scale(0.92);
        }

        .rttr-ep-ipa {
          font-size: 13px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: #7a6840;
          letter-spacing: 0.03em;
        }

        .rttr-ep-close {
          margin-left: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          color: #a09070;
          cursor: pointer;
          font-size: 14px;
          border-radius: 4px;
        }

        .rttr-ep-close:hover {
          background: rgba(0,0,0,0.04);
          color: #605040;
        }

        .rttr-ep-divider {
          height: 1px;
          background: rgba(140, 120, 80, 0.15);
          margin: 0 16px;
        }

        .rttr-ep-body {
          padding: 12px 16px 16px;
          font-size: 14px;
          line-height: 1.5;
          color: #4a3f35;
        }

        .rttr-ep-section {
          margin-bottom: 8px;
        }
        .rttr-ep-section:last-child {
          margin-bottom: 0;
        }

        .rttr-ep-label {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          color: #8b6914;
          background: rgba(160, 130, 80, 0.12);
          padding: 2px 6px;
          border-radius: 4px;
          margin-bottom: 4px;
          letter-spacing: 0.02em;
        }

        .rttr-ep-text {
          color: #3a2f25;
        }

        .rttr-ep-loading {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #807060;
          padding: 20px 16px;
        }

        .rttr-ep-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(140, 120, 80, 0.2);
          border-top-color: #8b6914;
          border-radius: 50%;
          animation: rttr-spin 0.7s linear infinite;
        }

        @media (prefers-color-scheme: dark) {
          #rttr-explain-panel {
            background: linear-gradient(145deg, #2a2520 0%, #252018 50%, #201c15 100%);
            border-color: rgba(120, 100, 70, 0.3);
            color: #e0d5c5;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
          }
          .rttr-ep-word { color: #f0e8d8; }
          .rttr-ep-speak { background: rgba(200, 170, 100, 0.15); color: #c8a850; }
          .rttr-ep-speak:hover { background: rgba(200, 170, 100, 0.25); }
          .rttr-ep-ipa { color: #b0a080; }
          .rttr-ep-close { color: #807060; }
          .rttr-ep-close:hover { background: rgba(255,255,255,0.06); color: #c0b0a0; }
          .rttr-ep-divider { background: rgba(120, 100, 70, 0.25); }
          .rttr-ep-body { color: #d0c5b0; }
          .rttr-ep-body.rttr-ep-loading { color: #908070; }
          .rttr-ep-spinner { border-color: rgba(140, 120, 80, 0.2); border-top-color: #c8a850; }
          .rttr-ep-text { color: #e0d5c5; }
        }

        /* ─── 自定义右键菜单 ─── */
        #rttr-context-menu {
          position: absolute;
          z-index: 2147483647;
          background: rgba(255, 255, 255, 0.85);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 10px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
          padding: 6px;
          font-family: system-ui, -apple-system, 'PingFang SC', sans-serif;
          min-width: 160px;
          opacity: 0;
          visibility: hidden;
          transform: scale(0.95);
          transform-origin: top left;
          transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.15s;
          pointer-events: auto;
        }

        #rttr-context-menu.rttr-cm-visible {
          opacity: 1;
          visibility: visible;
          transform: scale(1);
        }

        .rttr-cm-header {
          padding: 8px 12px 4px;
          font-size: 14px;
          font-weight: 600;
          color: #1c1c1e;
        }
        
        .rttr-cm-header.clickable {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.1s ease, color 0.1s ease;
          padding: 8px 12px;
          margin-bottom: 2px;
        }

        .rttr-cm-header.clickable:hover {
          background: #007aff;
          color: #ffffff;
        }
        
        .rttr-cm-header.clickable:hover .rttr-cm-header-speak {
          color: #ffffff;
        }

        .rttr-cm-header-text {
          word-break: break-all;
          max-width: 170px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .rttr-cm-header-speak {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #007aff;
        }

        .rttr-speaking .rttr-wave1 {
          animation: rttr-wave-pulse 1.2s infinite both;
        }
        .rttr-speaking .rttr-wave2 {
          animation: rttr-wave-pulse 1.2s infinite 0.2s both;
        }

        @keyframes rttr-wave-pulse {
          0% { opacity: 0; }
          30% { opacity: 1; }
          70% { opacity: 0; }
          100% { opacity: 0; }
        }

        .rttr-cm-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          font-size: 13px;
          color: #2c2c2e;
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.1s ease, color 0.1s ease;
        }

        .rttr-cm-item:hover {
          background: #007aff;
          color: #ffffff;
        }
        
        .rttr-cm-item:hover .rttr-cm-icon {
          color: #ffffff;
        }

        .rttr-cm-divider {
          height: 1px;
          background: rgba(0, 0, 0, 0.08);
          margin: 6px;
        }

        .rttr-cm-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8e8e93;
        }

        @media (prefers-color-scheme: dark) {
          #rttr-context-menu {
            background: rgba(30, 30, 32, 0.85);
            border-color: rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
          }
          .rttr-cm-header { color: #f2f2f7; }
          .rttr-cm-header.clickable:hover { background: #0a84ff; color: #ffffff; }
          .rttr-cm-header-speak { color: #0a84ff; }
          .rttr-cm-item { color: #e5e5ea; }
          .rttr-cm-item:hover { background: #0a84ff; color: #ffffff; }
          .rttr-cm-icon { color: #98989d; }
          .rttr-cm-item:hover .rttr-cm-icon { color: #ffffff; }
          .rttr-cm-divider { background: rgba(255, 255, 255, 0.1); }
        }
      `;
      document.head.appendChild(style);
    }

    // 处理上下文失效
    ctx.onInvalidated(() => {
      const style = document.getElementById('rttr-injected-styles');
      style?.remove();
      
      const tooltip = document.getElementById('rttr-global-tooltip');
      tooltip?.remove();

      const badge = document.getElementById('rttr-pronounce-badge');
      badge?.remove();

      const epanel = document.getElementById('rttr-explain-panel');
      epanel?.remove();

      const contextMenu = document.getElementById('rttr-context-menu');
      contextMenu?.remove();
    });
  },
});
