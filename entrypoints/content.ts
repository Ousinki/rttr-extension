
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



export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    console.log('[RTTR BOOT] content script loaded v-debug-1');
    let currentSettings: any;
    try {
      currentSettings = await settingsStorage.getValue();
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
    let activeSyllable: { node?: Text; span?: HTMLSpanElement; cleanup: () => void } | null = null;
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
            const rect = result.range.getBoundingClientRect();
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
            const sylText = currentSettings?.enableInlineSyllableRuby ? syllabifyText(word, '·') : word;

            requestAnimationFrame(() => {
              // Show IPA badge (floating, no jitter)
              const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
              if (currentSettings.showSingleClickIPA && cachedIpa) {
                uiActions.showPronounceBadge(cachedIpa, rect, false, word);
              } else {
                const shouldFetchIpa = currentSettings.showSingleClickIPA;
                uiActions.showPronounceBadge(speakerSVG, rect, true, word);
                if (shouldFetchIpa) {
                  lookupIpa(word).then((ipa) => {
                    if (ipa) {
                      uiActions.showPronounceBadge(ipa, rect, false, word);
                    }
                  });
                }
              }

              // Inline syllable replacement
              if (sylText !== word && sylText.includes('·')) {
                // Clean up any previous syllable span first
                cleanupActiveSyllable();
                
                // Instead of replacing the node with a span (which can destroy parent wrappers like <strong>),
                // we directly modify the text node's data if possible, or wrap it safely.
                // We will wrap the text node in our span but preserve the text node itself.
                const textNode = result.range.startContainer as Text;
                if (textNode.nodeType === Node.TEXT_NODE) {
                  const originalText = textNode.data;
                  const beforeText = originalText.substring(0, result.range.startOffset);
                  const afterText = originalText.substring(result.range.endOffset);
                  
                  // Modify the text node to contain the syllable text
                  textNode.data = beforeText + sylText + afterText;
                  
                  const originalWord = word;
                  let moveHandler: ((evt: MouseEvent) => void) | null = null;
                  
                  const cleanup = () => {
                    // Restore original text
                    if (textNode.parentNode) {
                      textNode.data = originalText;
                    }
                    if (moveHandler) {
                      document.removeEventListener('mousemove', moveHandler);
                      moveHandler = null;
                    }
                    if (activeSyllable?.node === textNode) {
                      activeSyllable = null;
                    }
                  };
                  
                  // Track globally for reliable cleanup
                  activeSyllable = { node: textNode, cleanup };
                  
                  // Mousemove proximity detection: cleanup when cursor leaves word area
                  moveHandler = (evt: MouseEvent) => {
                    if (!textNode.parentNode || !textNode.parentElement) {
                      cleanup();
                      return;
                    }
                    // Since textNode doesn't have getBoundingClientRect, we get the range rect
                    const range = document.createRange();
                    range.selectNodeContents(textNode);
                    const rect = range.getBoundingClientRect();
                    const pad = 15; // px padding around the word
                  if (
                    evt.clientX < rect.left - pad ||
                    evt.clientX > rect.right + pad ||
                    evt.clientY < rect.top - pad ||
                    evt.clientY > rect.bottom + pad
                  ) {
                    cleanup();
                  }
                };
                // Delay attaching to avoid immediate cleanup from the click position
                setTimeout(() => {
                  if (activeSyllable?.node === textNode) {
                    document.addEventListener('mousemove', moveHandler!);
                  }
                }, 150);
              }
            } // Close if (textNode.nodeType === Node.TEXT_NODE)
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
                  uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, rect, true,
                    currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true);
                }
              });
            }
          }
        }
      }
    }, { capture: true });



    document.addEventListener('keydown', async (e) => {
      if (!currentSettings?.enabled) return;

      // Shortcut Pronounce (R key with no modifiers)
      if (currentSettings?.enableShortcutPronounce && e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const sel = getActiveSelection();
        const text = sel?.toString().trim();
        if (sel && text && text.length > 0) {
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
        const rect = range.getBoundingClientRect();
        if (e.clientX >= rect.left - 5 && e.clientX <= rect.right + 5 &&
            e.clientY >= rect.top - 5 && e.clientY <= rect.bottom + 5) {
          selClickInfo = { text, rect };
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
                uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, info.rect, false,
                  currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true);
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
              uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, rect, false,
                currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true);
            }
          });
        }
      }, 50);
    });
    // Hover logic for Badges (moving away hides them)
    document.addEventListener('mousemove', (e) => {
      if (!currentSettings?.enabled) return;
      lastMouseTarget = e.target as HTMLElement;

      if (uiState.translationBadge.visible && uiState.translationBadge.rect) {
        const rect = uiState.translationBadge.rect;
        const PAD = 30;
        const inX = e.clientX >= rect.left - PAD && e.clientX <= rect.right + PAD;
        const inY = e.clientY >= rect.top - PAD && e.clientY <= rect.bottom + PAD;
        if (!inX || !inY) {
          uiActions.hideTranslationBadge();
        }
      }
      
      if (uiState.pronounceBadge.visible && uiState.pronounceBadge.rect) {
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
        const rangeRect = range.getBoundingClientRect();
        if (e.clientX < rangeRect.left || e.clientX > rangeRect.right ||
            e.clientY < rangeRect.top || e.clientY > rangeRect.bottom) return;
        e.preventDefault(); // Keep the blue selection highlight visible
        longPressWord = selText;
        longPressSentence = getSentenceAroundNode(range.startContainer);
        longPressRect = () => range.getBoundingClientRect();
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
        longPressRect = () => result.range.getBoundingClientRect();
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
        if (!isMultiWord && currentSettings.showSingleClickIPA && cachedIpa) {
          uiActions.showPronounceBadge(cachedIpa, longPressRect(), false, longPressWord);
        } else {
          uiActions.showPronounceBadge(speakerSVG, longPressRect(), true, longPressWord);
          if (!isMultiWord && currentSettings.showSingleClickIPA) {
            lookupIpa(longPressWord).then((ipa) => {
              if (ipa) {
                uiActions.showPronounceBadge(ipa, longPressRect(), false, longPressWord);
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
            uiActions.showTranslationBadge(resp.translation, 'AI', longPressRect(), false,
              currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true);
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
                uiActions.showTranslationBadge(resp.translation, 'AI', rect, false,
                  currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true);
              }
            });
          }});


          menuItems.push({ icon: iconTranslate, label: '翻译段落', onClick: () => {
            const paragraph = resolveTranslateParagraph(targetRange!.startContainer as HTMLElement);
            handleTranslate(paragraph);
          }});
          menuItems.push({ type: 'divider', label: 'DIVIDER' });
          menuItems.push({ icon: iconSettings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) });

          uiActions.showContextMenu(menuItems, e.clientX, e.clientY);
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

      const text = paragraph.textContent || '';
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
      currentSettings = newSettings;
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

  for (const node of nodes) {
    probe.selectNodeContents(node);
    const rects = probe.getClientRects();
    const firstRect = rects[0] || null;
    const lastRect = rects[rects.length - 1] || null;

    // Insert a boundary marker when the next text node lives on a different
    // visual line (e.g. separated by <br> or a block boundary), so the
    // word-expansion regex can't merge "toothache" + "pain" into one word.
    if (prevLastRect && firstRect) {
      const sameLine = firstRect.top < prevLastRect.bottom && firstRect.bottom > prevLastRect.top;
      if (!sameLine) fullText += '\n';
    }

    const start = fullText.length;
    fullText += node.nodeValue || '';
    nodeMap.push({ node, start, end: fullText.length });
    if (node === textNode) {
      targetGlobalOffset = start + range.startOffset;
    }
    if (lastRect) prevLastRect = lastRect;
  }

  const prevCh = targetGlobalOffset > 0 ? fullText[targetGlobalOffset - 1] : '';
  const nextCh = targetGlobalOffset < fullText.length ? fullText[targetGlobalOffset] : '';
  const wordRe = /[a-zA-Z0-9'.\-\[\]$£€¥°%]/;
  if (!wordRe.test(prevCh) && !wordRe.test(nextCh)) return null;

  let startGlobal = targetGlobalOffset;
  while (startGlobal > 0 && wordRe.test(fullText[startGlobal - 1])) startGlobal--;

  let endGlobal = targetGlobalOffset;
  while (endGlobal < fullText.length && wordRe.test(fullText[endGlobal])) endGlobal++;

  if (startGlobal === endGlobal) return null;

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
    
    .rttr-inline-syllable {
      color: #B56B45;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      letter-spacing: inherit;
    }
  `;
  document.head.appendChild(style);
}
