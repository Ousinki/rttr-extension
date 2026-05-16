
import { createApp } from 'vue';
import ContentApp from '@/components/content/ContentApp.vue';
import { uiActions, uiState, setLastInteractionY } from '@/utils/content-state';
import { settingsStorage } from '@/utils/storage';
import {
  applyAnnotations,
  findParagraph,
  getSentenceAroundNode,
  clearAnnotations
} from '@/utils/content-dom';
import { safeSendMessage } from '@/utils/content-messaging';
import { recognizeImageWord } from '@/utils/content-ocr';
import { speakText } from '@/utils/tts';
import { getNumberReading, isNumberLikeText } from '@/utils/number-reading';
import { syllabifyText } from '@/utils/syllables';
import { initSentenceFocus, splitBlock, splitAndFocusAtNode, handleSeparatorClick, isFocused, focusNext, focusPrev, focusSentenceAtNode, unfocusSentence, getFocusedSentenceText, getFocusedSentenceRect, isSplitActive } from "@/utils/sentence-focus";

function shouldFallbackToPronounceBadge(text: string, settings: any): boolean {
  if (uiState.translationBadge.pinned) return true;
  if (settings.translationPosition === 'pronounce-badge') {
    // Only fallback if the text is short enough (word-level)
    return text.length < 50 && !text.includes('\n');
  }
  return false;
}


function buildOverlayLines(range: Range, sylText: string): { text: string; rect: DOMRect }[] {
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) return [];
  if (rects.length === 1) {
    return [{ text: sylText, rect: rects[0] }];
  }

  const probe = document.createRange();
  const charRects: DOMRect[] = [];
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (range.intersectsNode(n)) {
      const textNode = n as Text;
      const startOffset = n === range.startContainer ? range.startOffset : 0;
      const endOffset = n === range.endContainer ? range.endOffset : textNode.length;
      for (let i = startOffset; i < endOffset; i++) {
        probe.setStart(textNode, i);
        probe.setEnd(textNode, i + 1);
        const r = probe.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) charRects.push(r);
      }
    }
  }

  const lines: { text: string; rect: DOMRect }[] = [];
  let currentLineChars = '';
  let currentLineRect: DOMRect | null = null;
  let sylIndex = 0;
  let charIndex = 0;

  while (sylIndex < sylText.length) {
    const char = sylText[sylIndex];
    if (char === '·') {
      currentLineChars += char;
      sylIndex++;
      continue;
    }

    const rect = charRects[charIndex];
    if (rect) {
      if (!currentLineRect) {
        currentLineRect = rect;
        currentLineChars = char;
      } else {
        if (Math.abs(rect.top - currentLineRect.top) < 10) {
          currentLineChars += char;
          const left = Math.min(currentLineRect.left, rect.left);
          const right = Math.max(currentLineRect.right, rect.right);
          const top = Math.min(currentLineRect.top, rect.top);
          const bottom = Math.max(currentLineRect.bottom, rect.bottom);
          currentLineRect = new DOMRect(left, top, right - left, bottom - top);
        } else {
          lines.push({ text: currentLineChars, rect: currentLineRect });
          currentLineChars = char;
          currentLineRect = rect;
        }
      }
    } else {
      currentLineChars += char;
    }
    sylIndex++;
    charIndex++;
  }

  if (currentLineRect && currentLineChars) {
    lines.push({ text: currentLineChars, rect: currentLineRect });
  }

  return lines.length > 0 ? lines : [{ text: sylText, rect: rects[0] }];
}

function getClosestRect(range: Range, x: number, y: number): DOMRect {
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) return range.getBoundingClientRect();
  if (rects.length === 1) return rects[0];

  let bestRect = rects[0];
  let minDistance = Infinity;
  for (const r of rects) {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = Math.pow(cx - x, 2) + Math.pow(cy - y, 2);
    if (dist < minDistance) {
      minDistance = dist;
      bestRect = r;
    }
  }
  return bestRect;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    console.log('[RTTR BOOT] content script loaded v-debug-1');
    let currentSettings: any;
    try {
      currentSettings = await settingsStorage.getValue();
      initSentenceFocus(currentSettings);
    } catch (e) {
      console.error('[RTTR] Failed to load settings:', e);
      return;
    }
    
    // Inject required styles for inline text elements (ShadowRoot cannot style host elements)
    injectStyles();

    // Cache to prevent UI jitter when repeatedly clicking the same word
    const localIpaCache = new Map<string, string>();
    const pendingIpaLookups = new Map<string, Promise<string | null>>();
    const getCachedIpa = (word: string) => localIpaCache.get(word) || null;
    const lookupIpa = (word: string) => {
      const cached = getCachedIpa(word);
      if (cached) return Promise.resolve(cached);
      const pending = pendingIpaLookups.get(word);
      if (pending) return pending;

      const request = safeSendMessage({ type: 'LOOKUP_IPA', word }).then((resp: any) => {
        const ipa = resp?.ipa || null;
        if (ipa) localIpaCache.set(word, ipa);
        return ipa;
      }).finally(() => {
        pendingIpaLookups.delete(word);
      });

      pendingIpaLookups.set(word, request);
      return request;
    };



    // Setup WXT ShadowRoot UI for Vue floating components
    let ui;
    try {
      ui = await createShadowRootUi(ctx, {
        name: 'rttr-ui-root',
        position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount: (container) => {
        const root = container.getRootNode() as ShadowRoot;
        if (root.host) {
          const host = root.host as HTMLElement;
          host.style.pointerEvents = 'none';
          host.style.position = 'fixed';
          host.style.top = '0';
          host.style.left = '0';
          host.style.width = '0';
          host.style.height = '0';
          host.style.zIndex = '2147483647';
          host.style.overflow = 'visible';
          host.classList.add('notranslate');
          host.setAttribute('translate', 'no');
        }
        
        const app = createApp(ContentApp);
        app.mount(container);
        return app;
      },
      onRemove: (app) => {
        app?.unmount();
      },
    });
    ui.mount();
    } catch (e) {
      console.error('[RTTR] Failed to setup ShadowRoot UI:', e);
      return;
    }

    // -- Event State --

    // TTS voice preheat: ensure voices are loaded before first speak
    document.addEventListener('pointerover', () => {
      if (window.speechSynthesis.getVoices().length === 0) window.speechSynthesis.getVoices();
    }, { once: true });
    const paragraphAbortControllers = new WeakMap<HTMLElement, AbortController>();
    
    let isLongPressFired = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let ringDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressEvent: PointerEvent | null = null;
    let selClickInfo: { text: string; rect: DOMRect } | null = null;
    let lastSelectionClickTime = 0;
    let pointerDownPos = { x: 0, y: 0 };

    // Syllable span tracking
    let activeSyllable: { span: HTMLSpanElement; cleanup: () => void } | null = null;
    function cleanupActiveSyllable() {
      if (activeSyllable) {
        activeSyllable.cleanup();
        activeSyllable = null;
      }
    }





    function getActiveSelection(): Selection | null {
      let sel = window.getSelection();
      const shadowRoot = document.querySelector('rttr-ui-root')?.shadowRoot;
      if ((!sel || sel.rangeCount === 0 || sel.isCollapsed) && shadowRoot) {
        const shadowSel = (shadowRoot as any).getSelection?.();
        if (shadowSel && shadowSel.rangeCount > 0 && !shadowSel.isCollapsed) {
          return shadowSel;
        }
      }
      return sel;
    }

    function applyInlineSyllableReplacement(range: Range, sylText: string) {
      cleanupActiveSyllable();
      const textNode = range.startContainer as Text;
      if (textNode.nodeType !== Node.TEXT_NODE) return;
      const wordStart = range.startOffset;
      const wordEnd = (range.endContainer === textNode) ? range.endOffset : textNode.data.length;
      
      const wordInNode = textNode.data.substring(wordStart, wordEnd);
      // Ensure we are syllabifying the exact substring
      const sylForNode = syllabifyText(wordInNode, '·');
      
      const wordNode = wordStart > 0 ? textNode.splitText(wordStart) : textNode;
      const wordLen = wordEnd - wordStart;
      if (wordNode.data.length > wordLen) {
        wordNode.splitText(wordLen);
      }
      
      const span = document.createElement('span');
      span.className = 'rttr-inline-syllable rttr-ui-ignore notranslate';
      span.setAttribute('translate', 'no');
      span.textContent = sylForNode;
      if (!wordNode.parentNode) return;
      wordNode.parentNode.replaceChild(span, wordNode);
      
      let moveHandler: ((evt: MouseEvent) => void) | null = null;
      
      const cleanup = () => {
        if (span.parentNode) {
          span.parentNode.replaceChild(wordNode, span);
          const next = wordNode.nextSibling;
          if (next && next.nodeType === Node.TEXT_NODE) {
            wordNode.data += (next as Text).data;
            next.remove();
          }
          const prev = wordNode.previousSibling;
          if (prev && prev.nodeType === Node.TEXT_NODE) {
            (prev as Text).data += wordNode.data;
            wordNode.remove();
          }
        }
        if (moveHandler) {
          document.removeEventListener('mousemove', moveHandler);
          moveHandler = null;
        }
        if (activeSyllable?.span === span) {
          activeSyllable = null;
        }
      };
      
      activeSyllable = { span, cleanup };
      
      moveHandler = (evt: MouseEvent) => {
        if (!span.parentNode) {
          cleanup();
          return;
        }
        const spanRect = span.getBoundingClientRect();
        const pad = 15;
        if (
          evt.clientX < spanRect.left - pad ||
          evt.clientX > spanRect.right + pad ||
          evt.clientY < spanRect.top - pad ||
          evt.clientY > spanRect.bottom + pad
        ) {
          cleanup();
        }
      };
      setTimeout(() => {
        if (activeSyllable?.span === span) {
          document.addEventListener('mousemove', moveHandler!);
        }
      }, 150);
    }

    function trackOverlayHide(rect: DOMRect) {
      let moveHandler: ((evt: MouseEvent) => void) | null = null;
      moveHandler = (evt: MouseEvent) => {
        const pad = 20;
        if (
          evt.clientX < rect.left - pad ||
          evt.clientX > rect.right + pad ||
          evt.clientY < rect.top - pad ||
          evt.clientY > rect.bottom + pad
        ) {
          uiActions.hideOverlaySyllable();
          if (moveHandler) {
            document.removeEventListener('mousemove', moveHandler);
          }
        }
      };
      setTimeout(() => {
        document.addEventListener('mousemove', moveHandler!);
      }, 150);
    }

    // -- Global Event Listeners --

    document.addEventListener('click', async (e) => {
      if (!currentSettings?.enabled) return;
      if (isLongPressFired) {
        isLongPressFired = false;
        return;
      }
      if (Date.now() - lastSelectionClickTime < 300) {
        return;
      }
      const target = e.target as HTMLElement;
      const isInsideUi = !!target.closest('rttr-ui-root') || !!target.closest('.rttr-word') || !!target.closest('#rttr-ui-root') || !!target.closest('div[style*="2147483647"]');
      
      if (!isInsideUi) {
        uiActions.hideContextMenu();
        uiActions.hideExplainPanel();
        cleanupActiveSyllable();
        uiActions.hideOverlaySyllable();
      }

      // Single Click Pronounce Logic
      if (currentSettings?.enableSingleClickPronounce && !isInsideUi) {
        const sel = getActiveSelection();
        const selText = sel?.toString().trim() || '';
        // Ignore selections that span multiple words from a single click
        // (caused by CSS user-select:all on some sites)
        const isRealSelection = selText.length > 0 && !selText.includes(' ') && selText.length < 50;
        if (!isRealSelection) {
          const result = getWordAtClick(e as MouseEvent);
          if (result && /^[a-zA-Z0-9'.\-\[\]$£€¥°%]+$/.test(result.word.trim()) && !result.word.includes(' ')) {
            const word = result.word.trim();
            const clickX = (e as MouseEvent).clientX;
            const clickY = (e as MouseEvent).clientY;
            const rect = getClosestRect(result.range, clickX, clickY);
            const sentence = getSentenceAroundNode(result.range.startContainer);
            if (isNumberLikeText(word)) {
              const numberPhrase = expandNumberWithUnit(result.range);
              const fallbackReading = getNumberReading(numberPhrase);
              uiActions.showPronounceBadge(fallbackReading, rect, false, word);
              safeSendMessage({ type: 'READ_NUMBER', numberText: numberPhrase, sentence }).then((resp: any) => {
                if (resp?.success && resp.reading) {
                  uiActions.showPronounceBadge(resp.reading, rect, false, word);
                  speakText(resp.reading, currentSettings);
                } else {
                  speakText(fallbackReading, currentSettings);
                }
              });
              return;
            }

            speakText(word, currentSettings);

            const cachedIpa = getCachedIpa(word);
            const isSyllableEnabled = currentSettings?.enableInlineSyllableRuby;
            const displayMode = currentSettings?.syllableDisplayMode || 'badge';
            const sylText = isSyllableEnabled ? syllabifyText(word, '·') : word;
            const hasSyllable = sylText !== word && sylText.includes('·');
            const finalSylText = (hasSyllable && displayMode === 'badge') ? sylText : null;

            if (hasSyllable) {
              if (displayMode === 'inline') {
                applyInlineSyllableReplacement(result.range, sylText);
              } else if (displayMode === 'overlay') {
                const parent = result.range.startContainer.parentElement || document.body;
                const computedStyle = window.getComputedStyle(parent);
                const rect = result.range.getBoundingClientRect();
                const overlayLines = buildOverlayLines(result.range, sylText);
                uiActions.showOverlaySyllable(
                  overlayLines, 
                  computedStyle.fontSize, 
                  computedStyle.fontWeight, 
                  computedStyle.fontFamily,
                  computedStyle.color,
                  computedStyle.letterSpacing,
                  computedStyle.fontStyle
                );
                trackOverlayHide(rect);
              }
            }

            requestAnimationFrame(() => {
              // Show IPA badge (floating, no jitter)
              const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
              if (currentSettings.showSingleClickIPA && cachedIpa) {
                uiActions.showPronounceBadge(cachedIpa, rect, false, word, finalSylText);
              } else {
                const shouldFetchIpa = currentSettings.showSingleClickIPA;
                uiActions.showPronounceBadge(speakerSVG, rect, true, word, finalSylText);
                if (shouldFetchIpa) {
                  lookupIpa(word).then((ipa) => {
                    if (ipa) {
                      uiActions.showPronounceBadge(ipa, rect, false, word, finalSylText);
                    }
                  });
                }
              }
            });

            const engine = currentSettings?.translationEngine || 'google';
            if (engine !== 'none') {
              const cleanWord = word.replace(/[.,;:!?]+$/, '');
              safeSendMessage({
                type: 'FETCH_TRANSLATION',
                text: cleanWord,
                sourceLang: 'auto',
                targetLang: currentSettings.targetLanguage || 'zh-CN',
                engine
              }).then((resp: any) => {
                if (resp && resp.targetText) {
                  if (shouldFallbackToPronounceBadge(word, currentSettings)) {
                    if (uiState.pronounceBadge.visible) {
                      uiActions.updatePronounceBadgeTranslation(resp.targetText);
                    } else {
                      uiActions.showPronounceBadge('', rect, false, null, null, resp.targetText);
                    }
                  } else {
                    const pos = currentSettings.translationPosition === 'pronounce-badge' ? 'bottom' : (currentSettings.translationPosition || 'bottom');
                    uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, rect, true,
                      pos, currentSettings.showTranslationEngine ?? true);
                  }
                }
              });
            }
          }
        }
      }
    }, { capture: true });


    // Click on separator ◯ to toggle sentence focus
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('rttr-sentence-sep') && !target.classList.contains('rttr-sentence-sep--hidden')) {
        handleSeparatorClick(e);
        if (currentSettings?.autoTranslateFocus) {
          setTimeout(() => {
            const text = getFocusedSentenceText();
            if (text) doFocusAPITranslate(text);
          }, 10);
        }
      }
    }, { capture: true });

    // --- Focus mode action helpers ---
    function doFocusTTS(text: string) {
      const rect = getFocusedSentenceRect();
      if (rect) {
        const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
        uiActions.showPronounceBadge(speakerSVG, rect, true);
        uiState.pronounceBadge.pinned = true;
      }
      speakText(text, currentSettings, () => {
        uiActions.hidePronounceBadge();
      });
    }

    function doFocusAPITranslate(text: string) {
      if (currentSettings.translationEngine === 'none') return;
      safeSendMessage({
        type: 'FETCH_TRANSLATION', text, sourceLang: 'auto',
        targetLang: currentSettings.targetLanguage || 'zh-CN',
        engine: currentSettings.translationEngine || 'google'
      }).then((resp: any) => {
        if (resp?.targetText) {
          const rect = getFocusedSentenceRect();
          if (rect) {
            const pos = currentSettings.translationPosition === 'pronounce-badge' ? 'bottom' : (currentSettings.translationPosition || 'bottom');
            uiActions.showTranslationBadge(resp.targetText, resp.engine || currentSettings.translationEngine, rect, false,
              pos, currentSettings.showTranslationEngine ?? true);
            uiState.translationBadge.pinned = true;
          }
        }
      });
    }

    function doFocusAITranslate(text: string) {
      const rect = getFocusedSentenceRect();
      if (!rect) return;
      const pos = currentSettings.translationPosition === 'pronounce-badge' ? 'bottom' : (currentSettings.translationPosition || 'bottom');
      uiActions.showTranslationBadge('AI 翻译中...', 'AI', rect, true, pos, currentSettings.showTranslationEngine ?? true);
      uiState.translationBadge.pinned = true;
      safeSendMessage({
        type: 'CONTEXTUAL_TRANSLATE',
        word: text,
        sentence: text
      }).then((resp: any) => {
        if (resp?.success && resp.translation) {
          const newRect = getFocusedSentenceRect();
          if (newRect) {
            const pos = currentSettings.translationPosition === 'pronounce-badge' ? 'bottom' : (currentSettings.translationPosition || 'bottom');
            uiActions.showTranslationBadge(resp.translation, 'AI', newRect, false, pos, currentSettings.showTranslationEngine ?? true);
            uiState.translationBadge.pinned = true;
          }
        } else if (resp?.error) {
          const newRect = getFocusedSentenceRect();
          if (newRect) {
            const pos = currentSettings.translationPosition === 'pronounce-badge' ? 'bottom' : (currentSettings.translationPosition || 'bottom');
            uiActions.showTranslationBadge(`翻译失败: ${resp.error}`, 'AI', newRect, false, pos, currentSettings.showTranslationEngine ?? true);
            uiState.translationBadge.pinned = true;
          }
        }
      });
    }



    document.addEventListener('keydown', async (e) => {
      if (!currentSettings?.enabled) return;

      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      const isRKey = e.key.toLowerCase() === 'r';

      // Arrow key navigation in sentence focus mode
      if (isFocused() && (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) || isRKey)) {
        if (isRKey && (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)) {
          return; // Allow native shortcuts like Cmd+R
        }
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return; // Ignore auto-repeat from holding key down
        if (e.code === 'ArrowUp') {
          uiActions.hideTranslationBadge();
          uiState.translationBadge.pinned = false;
          focusPrev();
          if (currentSettings.autoTranslateFocus) {
            const text = getFocusedSentenceText();
            if (text) doFocusAPITranslate(text);
          }
        } else if (e.code === 'ArrowDown') {
          uiActions.hideTranslationBadge();
          uiState.translationBadge.pinned = false;
          focusNext();
          if (currentSettings.autoTranslateFocus) {
            const text = getFocusedSentenceText();
            if (text) doFocusAPITranslate(text);
          }
        } else if (isRKey) {
          const text = getFocusedSentenceText();
          if (!text) return;
          doFocusTTS(text);
        } else if (e.code === 'ArrowLeft') {
          const text = getFocusedSentenceText();
          if (!text) return;
          if (uiState.translationBadge.visible && uiState.translationBadge.pinned) {
            if (uiState.translationBadge.translationType === 'api') {
              uiActions.hideTranslationBadge();
              uiState.translationBadge.pinned = false;
            } else {
              doFocusAPITranslate(text);
            }
          } else {
            doFocusAPITranslate(text);
          }
        } else if (e.code === 'ArrowRight') {
          const text = getFocusedSentenceText();
          if (!text) return;
          if (uiState.translationBadge.visible && uiState.translationBadge.pinned) {
            if (uiState.translationBadge.translationType === 'ai') {
              uiActions.hideTranslationBadge();
              uiState.translationBadge.pinned = false;
            } else {
              doFocusAITranslate(text);
            }
          } else {
            doFocusAITranslate(text);
          }
        }
        return;
      }

      // Escape exits focus mode
      if (isFocused() && e.code === 'Escape') {
        e.preventDefault();
        uiActions.hideTranslationBadge();
        uiActions.hidePronounceBadge();
        uiState.translationBadge.pinned = false;
        uiState.pronounceBadge.pinned = false;
        unfocusSentence();
        return;
      }

      // Shortcut Pronounce (R key with no modifiers)
      if (currentSettings?.enableShortcutPronounce && isRKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const sel = getActiveSelection();
        const text = sel?.toString().trim();
        if (sel && text && text.length > 0) {
          if (e.repeat) return; // Prevent spamming TTS when holding key
          e.preventDefault();
          speakText(text, currentSettings);
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
          uiActions.showPronounceBadge(speakerSVG, rect, true);
          return;
        }
      }
    }, { capture: true });

    let lastMouseTarget: HTMLElement | null = null;

    // Capture selection state on pointerdown (before click clears it) for click-on-selection features
    document.addEventListener('pointerdown', (e) => {
      setLastInteractionY(e.clientY);
      pointerDownPos = { x: e.clientX, y: e.clientY };
      if (!currentSettings?.enabled) return;
      const sel = getActiveSelection();
      const text = sel?.toString().trim() || '';
      if (text && sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        let isInside = false;
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (e.clientX >= r.left - 5 && e.clientX <= r.right + 5 &&
              e.clientY >= r.top - 5 && e.clientY <= r.bottom + 5) {
            isInside = true;
            break;
          }
        }
        if (isInside) {
          selClickInfo = { text, rect: range.getBoundingClientRect() };
          return;
        }
      }
      selClickInfo = null;
    });

    // Selection auto features (auto-pronounce / auto-translate) on pointerup
    document.addEventListener('pointerup', (e) => {
      if (!currentSettings?.enabled) return;
      if (e.button !== 0) return;
      if (isLongPressFired) return;
      const target = e.target as HTMLElement;
      if (target.closest('rttr-ui-root') || target.closest('.rttr-word')) return;

      // If clicking on existing selection → click features
      if (selClickInfo) {
        const info = selClickInfo;
        selClickInfo = null;

        if (/[\u4e00-\u9fa5]/.test(info.text)) return;

        lastSelectionClickTime = Date.now();
        if (currentSettings.enableClickPronounce) {
            speakText(info.text, currentSettings);
            const isSingleWord = /^[a-zA-Z\s'-]+$/.test(info.text.trim()) && !info.text.trim().includes(' ');
            const word = info.text.trim();
            const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
            const cachedIpa = isSingleWord ? getCachedIpa(word) : null;

            if (isSingleWord && currentSettings.showSingleClickIPA && cachedIpa) {
              uiActions.showPronounceBadge(cachedIpa, info.rect, false, word);
            } else {
              uiActions.showPronounceBadge(speakerSVG, info.rect, true, word);
              if (isSingleWord && currentSettings.showSingleClickIPA) {
                lookupIpa(word).then((ipa) => {
                  if (ipa) {
                    uiActions.showPronounceBadge(ipa, info.rect, false, word);
                  }
                });
              }
            }
          }
          if (currentSettings.enableClickTranslate && currentSettings.translationEngine !== 'none') {
            const engine = currentSettings.translationEngine;
            safeSendMessage({
              type: 'FETCH_TRANSLATION', text: info.text, sourceLang: 'auto',
              targetLang: currentSettings.targetLanguage || 'zh-CN', engine
            }).then((resp: any) => {
              if (resp && resp.targetText) {
                if (shouldFallbackToPronounceBadge(info.text, currentSettings)) {
                  if (uiState.pronounceBadge.visible) {
                    uiActions.updatePronounceBadgeTranslation(resp.targetText);
                  } else {
                    uiActions.showPronounceBadge('', info.rect, false, null, null, resp.targetText);
                  }
                } else {
                  const pos = currentSettings.translationPosition === 'pronounce-badge' ? 'bottom' : (currentSettings.translationPosition || 'top');
                  uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, info.rect, false,
                    pos, currentSettings.showTranslationEngine ?? true);
                }
              }
            });
          }
          return;
      }

      // New selection created (drag) → auto features
      // Guard: only process if user actually dragged (not a click).
      // Some sites use CSS user-select:all which creates full-element
      // selections on a single click — we must ignore those.
      const dragDist = Math.abs(e.clientX - pointerDownPos.x) + Math.abs(e.clientY - pointerDownPos.y);
      if (dragDist < 5) return;

      setTimeout(() => {
        const sel = getActiveSelection();
        const text = sel?.toString().trim() || '';
        if (!text || !sel || sel.rangeCount === 0) return;
        if (/[\u4e00-\u9fa5]/.test(text)) return;
        
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (currentSettings.enableAutoPronounce) {
          speakText(text, currentSettings);
          const isSingleWord = /^[a-zA-Z\s'-]+$/.test(text) && !text.includes(' ');
          const word = text.trim();
          const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';

          requestAnimationFrame(() => {
            const cachedIpa = isSingleWord ? getCachedIpa(word) : null;
            if (isSingleWord && currentSettings.showSingleClickIPA && cachedIpa) {
              uiActions.showPronounceBadge(cachedIpa, rect, false, word);
            } else {
              uiActions.showPronounceBadge(speakerSVG, rect, true, word);
              if (isSingleWord && currentSettings.showSingleClickIPA) {
                lookupIpa(word).then((ipa) => {
                  if (ipa) {
                    uiActions.showPronounceBadge(ipa, rect, false, word);
                  }
                });
              }
            }
          });
        }
        if (currentSettings.enableAutoTranslate && currentSettings.translationEngine !== 'none') {
          const engine = currentSettings.translationEngine;
          safeSendMessage({
            type: 'FETCH_TRANSLATION', text, sourceLang: 'auto',
            targetLang: currentSettings.targetLanguage || 'zh-CN', engine
          }).then((resp: any) => {
            if (resp && resp.targetText) {
              if (shouldFallbackToPronounceBadge(text, currentSettings)) {
                if (uiState.pronounceBadge.visible) {
                  uiActions.updatePronounceBadgeTranslation(resp.targetText);
                } else {
                  uiActions.showPronounceBadge('', rect, false, null, null, resp.targetText);
                }
              } else {
                const pos = currentSettings.translationPosition === 'pronounce-badge' ? 'bottom' : (currentSettings.translationPosition || 'top');
                uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, rect, false,
                  pos, currentSettings.showTranslationEngine ?? true);
              }
            }
          });
        }
      }, 50);
    });
    // Hover logic for Badges (moving away hides them)
    document.addEventListener('mousemove', (e) => {
      if (!currentSettings?.enabled) return;
      lastMouseTarget = e.target as HTMLElement;

      if (uiState.translationBadge.visible && uiState.translationBadge.rect && !uiState.translationBadge.pinned) {
        const rect = uiState.translationBadge.rect;
        const PAD = 30;
        const inX = e.clientX >= rect.left - PAD && e.clientX <= rect.right + PAD;
        const inY = e.clientY >= rect.top - PAD && e.clientY <= rect.bottom + PAD;
        if (!inX || !inY) {
          uiActions.hideTranslationBadge();
        }
      }
      
      if (uiState.pronounceBadge.visible && uiState.pronounceBadge.rect && !uiState.pronounceBadge.pinned) {
        const rect = uiState.pronounceBadge.rect;
        const PAD = 30;
        const inX = e.clientX >= rect.left - PAD && e.clientX <= rect.right + PAD;
        const inY = e.clientY >= rect.top - PAD && e.clientY <= rect.bottom + PAD;
        if (!inX || !inY) {
          uiActions.hidePronounceBadge();
        }
      }
    });

    // Long Press Logic
    document.addEventListener('pointerdown', (e) => {
      if (!currentSettings?.enabled) return;
      if (!currentSettings?.enableLongPressTranslate) return;
      if (e.button !== 0) return;
      isLongPressFired = false;

      const target = e.target as HTMLElement;
      
      const sel = getActiveSelection();
      const selText = sel?.toString().trim() || '';

      // Determine what to translate: selection or word under cursor
      let longPressWord: string;
      let longPressSentence: string;
      let longPressRect: () => DOMRect;

      if (selText.length > 0 && sel && sel.rangeCount > 0) {
        // Long press on selection → translate selection
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        let isInside = false;
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (e.clientX >= r.left - 5 && e.clientX <= r.right + 5 &&
              e.clientY >= r.top - 5 && e.clientY <= r.bottom + 5) {
            isInside = true;
            break;
          }
        }
        if (!isInside) return;
        
        e.preventDefault(); // Keep the blue selection highlight visible
        longPressWord = selText;
        longPressSentence = getSentenceAroundNode(range.startContainer);
        longPressRect = () => getClosestRect(range, pointerDownPos.x, pointerDownPos.y);
      } else {
        const annotatedTarget = getAnnotatedLongPressTarget(target);
        if (annotatedTarget) {
          longPressWord = annotatedTarget.text;
          longPressSentence = getSentenceAroundNode(annotatedTarget.node);
          longPressRect = () => annotatedTarget.rect();
        } else {
        // Long press on bare text → translate word under cursor
        const result = getWordAtClick(e);
        if (!result || !/^[a-zA-Z0-9\s'.\-\[\]$£€¥°%]+$/.test(result.word)) return;
        longPressWord = result.word;
        longPressSentence = getSentenceAroundNode(result.range.startContainer);
        longPressRect = () => getClosestRect(result.range, pointerDownPos.x, pointerDownPos.y);
        }
      }

      if (/[\u4e00-\u9fa5]/.test(longPressWord)) return;

      longPressEvent = e;

      // Delay showing the ring to avoid flashing on quick clicks
      ringDelayTimer = setTimeout(() => {
        uiActions.showLongPressRing(e.clientX, e.clientY);
      }, 150);

      longPressTimer = setTimeout(() => {
        isLongPressFired = true;
        const isMultiWord = longPressWord.trim().includes(' ');
        const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
        
        const cachedIpa = !isMultiWord ? getCachedIpa(longPressWord) : null;
        
        const isSyllableEnabled = currentSettings?.enableInlineSyllableRuby;
        const displayMode = currentSettings?.syllableDisplayMode || 'badge';
        const sylText = isSyllableEnabled ? syllabifyText(longPressWord, '·') : longPressWord;
        const hasSyllable = sylText !== longPressWord && sylText.includes('·');
        const finalSylText = (hasSyllable && displayMode === 'badge') ? sylText : null;

        if (hasSyllable && !isMultiWord) {
          if (displayMode === 'inline') {
            const wordResult = getWordAtClick(longPressEvent as MouseEvent);
            if (wordResult && wordResult.word === longPressWord) {
              applyInlineSyllableReplacement(wordResult.range, sylText);
            }
          } else if (displayMode === 'overlay') {
            const wordResult = getWordAtClick(longPressEvent as MouseEvent);
            if (wordResult && wordResult.word === longPressWord) {
              const parent = wordResult.range.startContainer.parentElement || document.body;
              const computedStyle = window.getComputedStyle(parent);
              const rect = wordResult.range.getBoundingClientRect();
              const overlayLines = buildOverlayLines(wordResult.range, sylText);
              uiActions.showOverlaySyllable(
                overlayLines, 
                computedStyle.fontSize, 
                computedStyle.fontWeight, 
                computedStyle.fontFamily,
                computedStyle.color,
                computedStyle.letterSpacing,
                computedStyle.fontStyle
              );
              trackOverlayHide(rect);
            }
          }
        }

        if (!isMultiWord && currentSettings.showSingleClickIPA && cachedIpa) {
          uiActions.showPronounceBadge(cachedIpa, longPressRect(), false, longPressWord, finalSylText);
        } else {
          uiActions.showPronounceBadge(speakerSVG, longPressRect(), true, longPressWord, finalSylText);
          if (!isMultiWord && currentSettings.showSingleClickIPA) {
            lookupIpa(longPressWord).then((ipa) => {
              if (ipa) {
                uiActions.showPronounceBadge(ipa, longPressRect(), false, longPressWord, finalSylText);
              }
            });
          }
        }
        
        safeSendMessage({
          type: 'CONTEXTUAL_TRANSLATE',
          word: longPressWord,
          sentence: longPressSentence
        }).then((resp: any) => {
          if (resp && resp.success && resp.translation) {
            if (shouldFallbackToPronounceBadge(longPressWord, currentSettings)) {
              if (uiState.pronounceBadge.visible) {
                uiActions.updatePronounceBadgeTranslation(resp.translation);
              } else {
                uiActions.showPronounceBadge('', longPressRect(), false, null, null, resp.translation);
              }
            } else {
              const pos = currentSettings.translationPosition === 'pronounce-badge' ? 'bottom' : (currentSettings.translationPosition || 'top');
              uiActions.showTranslationBadge(resp.translation, 'AI', longPressRect(), false,
                pos, currentSettings.showTranslationEngine ?? true);
            }
            // Extract the English collocation from AI response "english (translation)" and speak it
            const collocMatch = resp.translation.match(/^(.+?)\s*[（(]/);
            const speakPhrase = collocMatch ? collocMatch[1].trim() : longPressWord;
            speakText(speakPhrase, currentSettings);
          } else {
            // Fallback: speak the original word if AI fails
            speakText(longPressWord, currentSettings);
          }
        }).catch(() => {
          speakText(longPressWord, currentSettings);
        });
        uiActions.popLongPressRing();
      }, 500);
    });

    document.addEventListener('pointerup', () => {
      if (ringDelayTimer) {
        clearTimeout(ringDelayTimer);
        ringDelayTimer = null;
      }
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (!isLongPressFired) uiActions.hideLongPressRing();
    });

    document.addEventListener('pointermove', (e) => {
      if (longPressEvent && longPressTimer) {
        const dist = Math.sqrt(Math.pow(e.clientX - longPressEvent.clientX, 2) + Math.pow(e.clientY - longPressEvent.clientY, 2));
        if (dist > 5) {
          if (ringDelayTimer) {
            clearTimeout(ringDelayTimer);
            ringDelayTimer = null;
          }
          clearTimeout(longPressTimer);
          longPressTimer = null;
          uiActions.hideLongPressRing();
        }
      }
    });



    // Context Menu Logic
    document.addEventListener('contextmenu', async (e) => {
      if (!currentSettings?.enabled) return;
      if (!currentSettings?.enableContextMenu) return;
      const target = e.target as HTMLElement;

      const iconExplain = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>';
      const iconTranslate = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';
      const iconSettings = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

      const rttrWord = target.closest('.rttr-word') as HTMLElement;
      if (rttrWord) {
        e.preventDefault();
        const wordParts = Array.from(rttrWord.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'SPAN'))
          .map(n => n.textContent);
        const word = wordParts.join('');

        uiActions.showContextMenu([
          { 
            type: 'header', 
            label: word, 
            onSpeakClick: () => rttrWord.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
          },
          { type: 'divider', label: 'DIVIDER' },
          { icon: iconSettings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) }
        ], e.clientX, e.clientY);
        return;
      }

      const imageTarget = target.closest('img') as HTMLImageElement | null;
      if (imageTarget) {
        e.preventDefault();
        const imageText = imageTarget.alt || '图片没有可用描述';
        recognizeImageWord(imageTarget, e.clientX, e.clientY, imageText, currentSettings);
        return;
      }

      const selection = getActiveSelection();
      let selectedText = selection ? selection.toString().trim() : '';
      let hoveredWordResult = getWordAtClick(e as MouseEvent);
      
      if (selectedText || hoveredWordResult) {
        let targetText = '';
        let targetRange: Range | null = null;
        
        if (selectedText && selection && selection.rangeCount > 0) {
          const selRange = selection.getRangeAt(0);
          const rect = selRange.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
             targetText = selectedText;
             targetRange = selRange;
          }
        }
        
        if (!targetText && hoveredWordResult) {
           targetText = hoveredWordResult.word;
           targetRange = hoveredWordResult.range;
        }

        if (targetText && targetRange) {
          e.preventDefault();
          
          const isWord = /^[a-zA-Z\s'-]+$/.test(targetText) && !targetText.includes(' ');
          const isNumber = isNumberLikeText(targetText);

          const menuItems: any[] = [];
          
          if (isWord) {
            menuItems.push({ type: 'header', label: targetText, onSpeakClick: () => speakText(targetText, currentSettings) });
            menuItems.push({ type: 'divider', label: 'DIVIDER' });
          } else if (isNumber) {
            const numberPhrase = expandNumberWithUnit(targetRange);
            const fallbackReading = getNumberReading(numberPhrase);
            const sentence = getSentenceAroundNode(targetRange.startContainer);
            menuItems.push({ type: 'header', label: '读取中...', onSpeakClick: () => speakText(fallbackReading, currentSettings) });
            menuItems.push({ type: 'divider', label: 'DIVIDER' });
            safeSendMessage({ type: 'READ_NUMBER', numberText: numberPhrase, sentence }).then((resp: any) => {
              const reading = resp?.success && resp.reading ? resp.reading : fallbackReading;
              uiActions.updateContextMenuItem(0, {
                label: reading,
                onSpeakClick: () => speakText(reading, currentSettings),
              });
            });
          }

          menuItems.push({ icon: iconExplain, label: '分析语境', onClick: () => {
            const rect = targetRange!.getBoundingClientRect();
            const sentence = getSentenceAroundNode(targetRange!.startContainer);
            speakText(targetText, currentSettings);
            const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
            uiActions.showPronounceBadge(speakerSVG, rect, true, targetText);
            safeSendMessage({
              type: 'CONTEXTUAL_TRANSLATE',
              word: targetText,
              sentence
            }).then((resp: any) => {
              if (resp?.success && resp.translation) {
                if (shouldFallbackToPronounceBadge(targetText, currentSettings)) {
                  if (uiState.pronounceBadge.visible) {
                    uiActions.updatePronounceBadgeTranslation(resp.translation);
                  } else {
                    uiActions.showPronounceBadge('', rect, false, null, null, resp.translation);
                  }
                } else {
                  const pos = currentSettings.translationPosition === 'pronounce-badge' ? 'bottom' : (currentSettings.translationPosition || 'top');
                  uiActions.showTranslationBadge(resp.translation, 'AI', rect, false,
                    pos, currentSettings.showTranslationEngine ?? true);
                }
              }
            });
          }});


          menuItems.push({ icon: iconTranslate, label: '翻译段落', onClick: () => {
            const paragraph = resolveTranslateParagraph(targetRange!.startContainer as HTMLElement);
            handleTranslate(paragraph);
          }});

          // Sentence focus (only for <p> paragraphs with multiple sentences)
          const block = findParagraph(targetRange!.startContainer as HTMLElement);
          if (block && block.tagName === 'P') {
            const iconFocus = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/></svg>';
            if (isFocused()) {
              menuItems.push({ icon: iconFocus, label: '取消聚焦', onClick: () => unfocusSentence() });
            } else {
              menuItems.push({ icon: iconFocus, label: '聚焦此句', onClick: () => {
                splitAndFocusAtNode(targetRange!.startContainer, targetRange!.startOffset);
                if (currentSettings?.autoTranslateFocus) {
                  setTimeout(() => {
                    const text = getFocusedSentenceText();
                    if (text) doFocusAPITranslate(text);
                  }, 10);
                }
              }});
            }
          }

          menuItems.push({ type: 'divider', label: 'DIVIDER' });
          menuItems.push({ icon: iconSettings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) });

          uiActions.showContextMenu(menuItems, e.clientX, e.clientY);
          return;
        }
      }

    }, { capture: true });

    // Resolve which paragraph to translate — shared by shortcut & context menu
    // Rule: selection wins (use anchorNode), otherwise fall back to the given element.
    function resolveTranslateParagraph(fallback: HTMLElement | null): HTMLElement | null {
      const selection = getActiveSelection();
      let targetNode: Node | null = null;
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        targetNode = selection.anchorNode;
      } else if (fallback) {
        targetNode = fallback;
      }
      if (!targetNode) return null;
      const el = targetNode.nodeType === Node.ELEMENT_NODE
        ? (targetNode as HTMLElement)
        : targetNode.parentElement;
      return findParagraph(el);
    }

    // Main Translate Handler
    async function handleTranslate(paragraph: HTMLElement | null) {
      if (!paragraph) return;
      if (paragraph.getAttribute('data-rttr-annotated') === 'true') {
        clearAnnotations(paragraph);
      }

      uiActions.hideContextMenu();
      uiActions.hideExplainPanel();

      let text = paragraph.textContent || '';
      text = text.replace(/◯/g, ' '); // Prevent AI from seeing/translating the separator symbol while preserving offsets
      console.log('[RTTR TRANSLATE] paragraph.innerHTML:', paragraph.innerHTML);
      console.log('[RTTR TRANSLATE] paragraph.textContent sent to AI:', JSON.stringify(text));
      if (!text.trim()) return;

      paragraphAbortControllers.get(paragraph)?.abort();
      const abortController = new AbortController();
      paragraphAbortControllers.set(paragraph, abortController);
      const signal = abortController.signal;

      const engine = currentSettings?.translationEngine || 'google';

      setParagraphLoading(paragraph, true);

      try {
        const response = await safeSendMessage({ type: 'TRANSLATE', text });
        if (signal.aborted) return;

        setParagraphLoading(paragraph, false);

        if (response?.success && response.results) {
          console.log('[RTTR TRANSLATE] AI results:', response.results.map((r: any) => ({
            text: r.text,
            start: r.start,
            end: r.end,
            kind: r.kind,
            ipa: r.ipa,
            pronunciation: r.pronunciation,
            substringAtRange: text.slice(r.start, r.end),
          })));
          applyAnnotations(paragraph, response.results, currentSettings, () => isLongPressFired);
        }
        paragraphAbortControllers.delete(paragraph);
      } catch (err) {
        if (!signal.aborted) {
          setParagraphLoading(paragraph, false);
          console.error(err);
          paragraphAbortControllers.delete(paragraph);
        }
      }
    }

    settingsStorage.watch((newSettings) => {
      if (currentSettings && currentSettings.enabled !== newSettings.enabled) {
        showToast(newSettings.enabled ? '✅ RTTR 扩展已开启' : '💤 RTTR 扩展已关闭');
      }
      currentSettings = newSettings;
      initSentenceFocus(currentSettings);
    });

    // Listen for messages from background (e.g. Chrome Commands global shortcuts)
    browser.runtime.onMessage.addListener((message: any) => {
      if (message.type === 'TRIGGER_TRANSLATE') {
        const paragraph = resolveTranslateParagraph(lastMouseTarget);
        if (paragraph) handleTranslate(paragraph);
      }
    });
  }
});

function setParagraphLoading(paragraph: HTMLElement, isLoading: boolean) {
  paragraph.querySelectorAll(':scope > .rttr-inline-spinner').forEach((el) => el.remove());
  if (isLoading) {
    paragraph.classList.add('rttr-paragraph-loading');
    const spinner = document.createElement('span');
    spinner.className = 'rttr-inline-spinner';
    paragraph.appendChild(spinner);
  } else {
    paragraph.classList.remove('rttr-paragraph-loading');
  }
}

function getWordAtClick(e: MouseEvent): { word: string; range: Range } | null {
  const x = e.clientX;
  const y = e.clientY;

  const elAtPoint = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!elAtPoint) return null;

  let range: Range | null = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(x, y);
    if (!pos) return null;
    range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
  } else {
    return null;
  }

  if (!range) return null;
  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;

  const textParent = textNode.parentElement;
  if (!textParent) return null;
  if (elAtPoint !== textParent && !textParent.contains(elAtPoint)) {
    return null;
  }

  // Use TreeWalker to gather all text nodes in the nearest paragraph/block
  const p = findParagraph(textNode as HTMLElement) || document.body;
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
  const nodes: Text[] = [];
  let n;
  while (n = walker.nextNode()) nodes.push(n as Text);

  let fullText = '';
  let targetGlobalOffset = 0;
  const nodeMap: { node: Text; start: number; end: number }[] = [];
  let prevLastRect: DOMRect | null = null;
  const probe = document.createRange();

  let prevNode: Text | null = null;

  for (const node of nodes) {
    probe.selectNodeContents(node);
    const rects = probe.getClientRects();
    const firstRect = rects[0] || null;
    const lastRect = rects[rects.length - 1] || null;

    // Insert a boundary marker when the next text node lives on a different
    // visual line (e.g. separated by <br> or a block boundary), so the
    // word-expansion regex can't merge "toothache" + "pain" into one word.
    let needsBoundary = false;
    if (prevLastRect && firstRect) {
      const sameLine = firstRect.top < prevLastRect.bottom && firstRect.bottom > prevLastRect.top;
      if (!sameLine) needsBoundary = true;
    }

    // Also insert a boundary when adjacent text nodes belong to different
    // inline parent elements (e.g. different <a> or <span> tags inside a
    // <div>).  Without this, "Blog" + "Projects" + "Tags" inside
    //   <div><a>Blog</a><a>Projects</a><a>Tags</a></div>
    // would be concatenated into "BlogProjectsTags" and treated as one word.
    if (!needsBoundary && prevNode && node.parentElement && prevNode.parentElement) {
      if (node.parentElement !== prevNode.parentElement &&
          !node.parentElement.contains(prevNode.parentElement) &&
          !prevNode.parentElement.contains(node.parentElement)) {
        needsBoundary = true;
      }
    }

    if (needsBoundary) fullText += '\n';

    const start = fullText.length;
    fullText += node.nodeValue || '';
    nodeMap.push({ node, start, end: fullText.length });
    if (node === textNode) {
      targetGlobalOffset = start + range.startOffset;
    }
    if (lastRect) prevLastRect = lastRect;
    prevNode = node;
  }

  const prevCh = targetGlobalOffset > 0 ? fullText[targetGlobalOffset - 1] : '';
  const nextCh = targetGlobalOffset < fullText.length ? fullText[targetGlobalOffset] : '';
  const wordRe = /[a-zA-Z0-9'.\-$£€¥°%]/;
  if (!wordRe.test(prevCh) && !wordRe.test(nextCh)) return null;

  let startGlobal = targetGlobalOffset;
  while (startGlobal > 0 && wordRe.test(fullText[startGlobal - 1])) startGlobal--;

  let endGlobal = targetGlobalOffset;
  while (endGlobal < fullText.length && wordRe.test(fullText[endGlobal])) endGlobal++;

  // Trim trailing punctuation that shouldn't be part of the word
  while (endGlobal > startGlobal) {
    const lastChar = fullText[endGlobal - 1];
    if (['.', ',', ';', ':', '!', '?', "'", '"', ']', ')', '}'].includes(lastChar)) {
      endGlobal--;
    } else {
      break;
    }
  }

  // Trim leading punctuation
  while (startGlobal < endGlobal) {
    const firstChar = fullText[startGlobal];
    // We keep currency symbols because number logic might use them, but we strip brackets/quotes
    if (['.', ',', ';', ':', '!', '?', "'", '"', '[', '(', '{'].includes(firstChar)) {
      startGlobal++;
    } else {
      break;
    }
  }

  if (startGlobal >= endGlobal) return null;

  const word = fullText.substring(startGlobal, endGlobal);
  
  // Find start and end nodes for the Range
  const startNodeInfo = nodeMap.find(m => startGlobal >= m.start && startGlobal < m.end) || nodeMap[0];
  // Note: endGlobal can be equal to m.end, which means it ends exactly at the end of a node
  const endNodeInfo = nodeMap.find(m => endGlobal > m.start && endGlobal <= m.end) || nodeMap[nodeMap.length - 1];
  
  const wordRange = document.createRange();
  try {
    wordRange.setStart(startNodeInfo.node, startGlobal - startNodeInfo.start);
    wordRange.setEnd(endNodeInfo.node, endGlobal - endNodeInfo.start);
  } catch (e) {
    return null;
  }

  // Final gate: click must fall inside the word's rendered rects.
  // Because the word might span multiple elements, it might have multiple rects.
  const rects = wordRange.getClientRects();
  let isInside = false;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) {
      isInside = true;
      break;
    }
  }
  if (!isInside) return null;

  return { word, range: wordRange };
}

function expandNumberWithUnit(range: Range): string {
  const numberText = range.toString().trim();
  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return numberText;

  const text = textNode.nodeValue || '';
  const after = text.slice(range.endOffset);
  const unitMatch = after.match(/^\s+(days?|years?|months?|weeks?|hours?|minutes?|seconds?|percent|%|dollars?|euros?|pounds?|meters?|kilometers?|miles?|bytes?|kb|mb|gb|tb|notes?|°[cf]?)(?=\s|$|\W)/i);
  if (!unitMatch) return numberText;

  return `${numberText}${unitMatch[0]}`;
}

function getAnnotatedLongPressTarget(target: HTMLElement): { text: string; node: Node; rect: () => DOMRect } | null {
  const wrapper = target.closest('.rttr-word') as HTMLElement | null;
  if (!wrapper) return null;

  const targetText = (target.tagName === 'SPAN' ? target.textContent : '')?.trim() || '';
  if (isNumberLikeText(targetText)) {
    return {
      text: targetText,
      node: target,
      rect: () => target.getBoundingClientRect(),
    };
  }

  const text = Array.from(wrapper.childNodes)
    .filter((node) => !(node instanceof HTMLElement && node.tagName === 'RT'))
    .map((node) => node.textContent || '')
    .join('')
    .trim();

  if (!text || !/^[a-zA-Z0-9\s'.\-\[\]$£€¥°%]+$/.test(text)) return null;

  return {
    text,
    node: wrapper,
    rect: () => wrapper.getBoundingClientRect(),
  };
}


function injectStyles() {
  const style = document.createElement('style');
  style.id = 'rttr-injected-styles';
  style.textContent = `
    .rttr-word {
      color: var(--rttr-token-color, #4a90d9);
      cursor: text;
      position: relative;
      transition: opacity 0.3s ease, color 0.2s ease;
      user-select: text !important;
      -webkit-user-select: text !important;
    }
    .rttr-word::selection, .rttr-word *::selection {
      background-color: #b3d4fc !important;
      color: #000 !important;
    }
    .rttr-word:hover {
      color: var(--rttr-token-color, #2a70b9) !important;
    }
    span.rttr-tooltip-only, ruby.rttr-has-tooltip {
      border-bottom: 1px dashed currentColor;
    }
    .rttr-word-highlight rt.rttr-translation {
      opacity: 0.85;
    }

    ruby.rttr-word rt.rttr-translation {
      cursor: pointer;
      font-size: 0.55em;
      color: inherit;
      font-weight: 400;
      letter-spacing: 0;
      line-height: 1;
      padding: 0;
      text-align: center;
      ruby-align: center;
      user-select: none;
      -webkit-user-select: none;
      transform: translateY(0.15em);
      transition: all 0.2s ease;
    }
    ruby.rttr-word:hover rt.rttr-translation {
      opacity: 1;
    }
    [data-rttr-annotated="true"] {
      line-height: 1.8 !important;
    }

    .rttr-paragraph-loading {
      color: #999 !important;
      transition: color 0.3s ease;
    }
    .rttr-paragraph-loading > :not(.rttr-inline-spinner) {
      opacity: 0.5 !important;
      transition: opacity 0.3s ease;
    }
    .rttr-inline-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(150, 150, 150, 0.3);
      border-top-color: #888;
      border-radius: 50%;
      animation: rttr-spin 0.8s linear infinite;
      margin-left: 8px;
      vertical-align: middle;
    }
    @keyframes rttr-spin {
      to { transform: rotate(360deg); }
    }
    
    .rttr-inline-syllable,
    strong .rttr-inline-syllable,
    b .rttr-inline-syllable,
    em .rttr-inline-syllable {
      color: #B56B45 !important;
      -webkit-text-fill-color: #B56B45 !important;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      letter-spacing: inherit;
    }

    .rttr-sentence-sep {
      display: inline-block;
      color: rgba(120, 130, 150, 0.5);
      font-size: 1.4em;
      line-height: 1;
      vertical-align: middle;
      margin: 0 0.1em;
      user-select: none;
      cursor: pointer;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                  color 0.25s ease,
                  text-shadow 0.25s ease,
                  filter 0.25s ease;
    }
    .rttr-sentence-sep:hover {
      transform: scale(1.15);
      color: rgba(90, 160, 230, 0.9);
      text-shadow: 0 0 6px rgba(90, 160, 230, 0.4), 0 0 12px rgba(90, 160, 230, 0.15);
    }
    .rttr-sentence-sep--hidden {
      display: none;
    }
    .rttr-sentence-sep--trailing {
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    p:hover > .rttr-sentence-sep--trailing:last-child,
    li:hover > .rttr-sentence-sep--trailing:last-child,
    div:hover > .rttr-sentence-sep--trailing:last-child {
      opacity: 1;
    }
    @media (prefers-color-scheme: dark) {
      .rttr-sentence-sep {
        color: rgba(160, 170, 190, 0.4);
      }
    }

    ::highlight(rttr-sentence-dim) {
      color: rgba(120, 130, 150, 0.2) !important;
    }
    @media (prefers-color-scheme: dark) {
      ::highlight(rttr-sentence-dim) {
        color: rgba(160, 170, 190, 0.15) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function showToast(message: string) {
  let toast = document.getElementById('rttr-global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'rttr-global-toast';
    Object.assign(toast.style, {
      all: 'initial',
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%) translateY(-10px)',
      backgroundColor: 'rgba(17, 24, 39, 0.9)',
      color: '#ffffff',
      padding: '10px 20px',
      borderRadius: '24px',
      fontSize: '14px',
      fontWeight: '500',
      zIndex: '2147483647',
      pointerEvents: 'none',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      opacity: '0',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    });
    document.documentElement.appendChild(toast);
  }
  toast.textContent = message;
  
  // Force reflow
  void toast.offsetWidth;
  
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  
  if ((toast as any)._timeoutId) {
    clearTimeout((toast as any)._timeoutId);
  }
  
  (toast as any)._timeoutId = setTimeout(() => {
    if (toast) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }
  }, 1000);
}
