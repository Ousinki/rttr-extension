
import { createApp } from 'vue';
import ContentApp from '@/components/content/ContentApp.vue';
import { uiActions, uiState } from '@/utils/content-state';
import { settingsStorage } from '@/utils/storage';
import {
  applyAnnotations,
  undoStack,
  undoDismiss,
  findParagraph,
  getSentenceAroundNode,
  getIsDraggingRttrWord,
  clearAnnotations
} from '@/utils/content-dom';
import { safeSendMessage } from '@/utils/content-messaging';
import { recognizeImageWord } from '@/utils/content-ocr';
import { speakText } from '@/utils/tts';



export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    let currentSettings: any;
    try {
      currentSettings = await settingsStorage.getValue();
    } catch (e) {
      console.error('[RTTR] Failed to load settings:', e);
      return;
    }
    
    // Inject required styles for inline text elements (ShadowRoot cannot style host elements)
    injectStyles();



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
          (root.host as HTMLElement).style.pointerEvents = 'none';
          (root.host as HTMLElement).style.zIndex = '2147483647';
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
    let activeParagraph: HTMLElement | null = null;
    let translateAbortController: AbortController | null = null;
    
    let isLongPressFired = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let ringDelayTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressEvent: PointerEvent | null = null;
    let selClickInfo: { text: string; rect: DOMRect } | null = null;



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

    function checkShortcut(e: KeyboardEvent, shortcut: string): boolean {
      if (!shortcut) return false;
      const keys = shortcut.split('+');
      const ctrl = keys.includes('Ctrl');
      const meta = keys.includes('Meta');
      const alt = keys.includes('Alt');
      const shift = keys.includes('Shift');
      const code = keys.filter(k => !['Ctrl', 'Meta', 'Alt', 'Shift'].includes(k))[0];
      
      return e.ctrlKey === ctrl && e.metaKey === meta && e.altKey === alt && e.shiftKey === shift && e.code === code;
    }

    // -- Global Event Listeners --

    document.addEventListener('click', async (e) => {
      if (!currentSettings?.enabled) return;
      if (isLongPressFired) {
        isLongPressFired = false;
        return;
      }
      const target = e.target as HTMLElement;
      const isInsideUi = !!target.closest('rttr-ui-root') || !!target.closest('.rttr-word') || !!target.closest('#rttr-ui-root') || !!target.closest('div[style*="2147483647"]');
      
      if (!isInsideUi) {
        uiActions.hideContextMenu();
        uiActions.hideExplainPanel();
        uiActions.hidePronounceBadge();
      }

      // Single Click Pronounce Logic
      if (currentSettings?.enableSingleClickPronounce && !isInsideUi) {
        const sel = getActiveSelection();
        if (!sel || sel.toString().trim().length === 0) {
          const result = getWordAtClick(e as MouseEvent);
          if (result && /^[a-zA-Z'-]+$/.test(result.word.trim()) && !result.word.includes(' ')) {
            const word = result.word.trim();
            speakText(word, currentSettings);
            
            if (currentSettings.showSingleClickIPA) {
              const rect = result.range.getBoundingClientRect();
              const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
              
              uiActions.showPronounceBadge(speakerSVG, rect, true);
              safeSendMessage({ type: 'LOOKUP_IPA', word }).then((resp: any) => {
                if (resp?.ipa) {
                  uiActions.showPronounceBadge(resp.ipa, rect);
                }
              });
            }

            const engine = currentSettings?.translationEngine || 'google';
            if (engine !== 'none') {
              safeSendMessage({
                type: 'FETCH_TRANSLATION',
                text: word,
                sourceLang: 'auto',
                targetLang: navigator.language.startsWith('zh') ? 'zh-CN' : 'zh-TW',
                engine
              }).then((resp: any) => {
                if (resp && resp.targetText) {
                  uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, result.range.getBoundingClientRect(), true,
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
      // Undo
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        if (undoStack.length > 0) {
          e.preventDefault();
          const lastAction = undoStack.pop();
          if (lastAction) undoDismiss(lastAction);
        }
        return;
      }

      // Shortcut Pronounce (R key with no modifiers)
      if (currentSettings?.enableShortcutPronounce && e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const sel = getActiveSelection();
        const text = sel?.toString().trim();
        if (text && text.length > 0) {
          e.preventDefault();
          speakText(text, currentSettings);
          return;
        }
      }

      // Translate (Paragraph)
      if (checkShortcut(e, currentSettings?.paragraphShortcut || 'Alt+KeyT')) {
        e.preventDefault();
        
        const selection = getActiveSelection();
        let targetNode: Node | null = null;

        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
          targetNode = selection.anchorNode;
        } else if (lastMouseTarget) {
          targetNode = lastMouseTarget;
        }

        if (!targetNode) {
          return;
        }
        
        const paragraph = findParagraph(targetNode as HTMLElement);
        if (paragraph) {
          handleTranslate(paragraph);
        }
      }
    }, { capture: true });

    let lastMouseTarget: HTMLElement | null = null;

    // Capture selection state on mousedown (before click clears it) for click-on-selection features
    document.addEventListener('mousedown', (e) => {
      if (!currentSettings?.enabled) return;
      const sel = getActiveSelection();
      const text = sel?.toString().trim() || '';
      if (text && sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          selClickInfo = { text, rect };
          return;
        }
      }
      selClickInfo = null;
    });

    // Selection auto features (auto-pronounce / auto-translate) on mouseup
    document.addEventListener('mouseup', (e) => {
      if (!currentSettings?.enabled) return;
      if (isLongPressFired) return;
      const target = e.target as HTMLElement;
      if (target.closest('rttr-ui-root') || target.closest('.rttr-word')) return;

      // If clicking on existing selection → click features
      if (selClickInfo) {
        const info = selClickInfo;
        selClickInfo = null;
        if (currentSettings.enableClickPronounce) {
          speakText(info.text, currentSettings);
          const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
          uiActions.showPronounceBadge(speakerSVG, info.rect, true);
        }
        if (currentSettings.enableClickTranslate && currentSettings.translationEngine !== 'none') {
          const engine = currentSettings.translationEngine;
          safeSendMessage({
            type: 'FETCH_TRANSLATION', text: info.text, sourceLang: 'auto',
            targetLang: navigator.language.startsWith('zh') ? 'zh-CN' : 'zh-TW', engine
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
      setTimeout(() => {
        const sel = getActiveSelection();
        const text = sel?.toString().trim() || '';
        if (!text || !sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (currentSettings.enableAutoPronounce) {
          speakText(text, currentSettings);
          const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
          uiActions.showPronounceBadge(speakerSVG, rect, true);
        }
        if (currentSettings.enableAutoTranslate && currentSettings.translationEngine !== 'none') {
          const engine = currentSettings.translationEngine;
          safeSendMessage({
            type: 'FETCH_TRANSLATION', text, sourceLang: 'auto',
            targetLang: navigator.language.startsWith('zh') ? 'zh-CN' : 'zh-TW', engine
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
      if (e.button !== 0 || getIsDraggingRttrWord()) return;
      isLongPressFired = false;

      const target = e.target as HTMLElement;
      if (target.closest('.rttr-word') || target.closest('ruby')) return;
      
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
        // Long press on bare text → translate word under cursor
        const result = getWordAtClick(e);
        if (!result || !/^[a-zA-Z\s'-]+$/.test(result.word)) return;
        longPressWord = result.word;
        longPressSentence = getSentenceAroundNode(result.range.startContainer);
        longPressRect = () => result.range.getBoundingClientRect();
      }

      longPressEvent = e;

      // Delay showing the ring to avoid flashing on quick clicks
      ringDelayTimer = setTimeout(() => {
        uiActions.showLongPressRing(e.clientX, e.clientY);
      }, 150);

      longPressTimer = setTimeout(() => {
        isLongPressFired = true;
        speakText(longPressWord, currentSettings);
        
        safeSendMessage({
          type: 'CONTEXTUAL_TRANSLATE',
          word: longPressWord,
          sentence: longPressSentence
        }).then((resp: any) => {
          if (resp && resp.success && resp.translation) {
            uiActions.showTranslationBadge(resp.translation, 'AI', longPressRect(), false,
              currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true);
          }
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

    // Prevent browser's default drop-forbidden cursor during rttr-word drag
    document.addEventListener('dragover', (e) => {
      if (getIsDraggingRttrWord()) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      }
    });

    // Context Menu Logic
    document.addEventListener('contextmenu', async (e) => {
      if (!currentSettings?.enabled) return;
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

          const menuItems: any[] = [];
          
          if (isWord) {
            menuItems.push({ type: 'header', label: targetText, onSpeakClick: () => speakText(targetText, currentSettings) });
            menuItems.push({ type: 'divider', label: 'DIVIDER' });
          }

          menuItems.push({ icon: iconExplain, label: '分析语境', onClick: () => {
            const rect = targetRange!.getBoundingClientRect();
            const sentence = getSentenceAroundNode(targetRange!.startContainer);
            uiActions.showExplainPanelLoading(targetText, rect);
            speakText(targetText, currentSettings);
            safeSendMessage({ type: 'EXPLAIN_WORD', word: targetText, sentence }).then((resp: any) => {
              if (resp?.success && resp.explanation) {
                uiActions.showExplainPanel(targetText, resp.ipa || null, resp.explanation, rect);
              }
            });
          }});

          menuItems.push({ icon: iconTranslate, label: '翻译段落', onClick: () => handleTranslate(findParagraph(targetRange!.startContainer as HTMLElement)) });
          menuItems.push({ type: 'divider', label: 'DIVIDER' });
          menuItems.push({ icon: iconSettings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) });

          uiActions.showContextMenu(menuItems, e.clientX, e.clientY);
        }
      }
    }, { capture: true });

    // Main Translate Handler
    async function handleTranslate(paragraph: HTMLElement | null) {
      if (!paragraph) return;
      if (activeParagraph === paragraph) return;
      if (activeParagraph) clearAnnotations(activeParagraph);
      
      activeParagraph = paragraph;
      uiActions.hideContextMenu();
      uiActions.hideExplainPanel();

      const text = paragraph.textContent || '';
      if (!text.trim()) return;

      if (translateAbortController) translateAbortController.abort();
      translateAbortController = new AbortController();
      const signal = translateAbortController.signal;

      const engine = currentSettings?.translationEngine || 'google';

      setParagraphLoading(paragraph, true);

      try {
        const response = await safeSendMessage({ type: 'TRANSLATE', text });
        if (signal.aborted) return;
        
        setParagraphLoading(paragraph, false);

        if (response?.success && response.results) {
          applyAnnotations(paragraph, response.results, currentSettings, () => isLongPressFired);
        }
      } catch (err) {
        if (!signal.aborted) {
          setParagraphLoading(paragraph, false);
          console.error(err);
        }
      }
    }

    settingsStorage.watch((newSettings) => {
      currentSettings = newSettings;
    });

    // Listen for messages from background (e.g. Chrome Commands global shortcuts)
    browser.runtime.onMessage.addListener((message: any) => {
      if (message.type === 'TRIGGER_TRANSLATE') {
        const selection = getActiveSelection();
        let targetNode: Node | null = null;
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
          targetNode = selection.anchorNode;
        } else if (lastMouseTarget) {
          targetNode = lastMouseTarget;
        }
        if (targetNode) {
          const paragraph = findParagraph(targetNode as HTMLElement);
          if (paragraph) handleTranslate(paragraph);
        }
      }
    });
  }
});

function setParagraphLoading(paragraph: HTMLElement, isLoading: boolean) {
  if (isLoading) {
    paragraph.classList.add('rttr-paragraph-loading');
    const spinner = document.createElement('span');
    spinner.className = 'rttr-inline-spinner';
    spinner.id = 'rttr-current-spinner';
    paragraph.appendChild(spinner);
  } else {
    paragraph.classList.remove('rttr-paragraph-loading');
    const spinner = paragraph.querySelector('#rttr-current-spinner');
    if (spinner) spinner.remove();
  }
}

function getWordAtClick(e: MouseEvent): { word: string; range: Range } | null {
  const x = e.clientX;
  const y = e.clientY;
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

  const text = textNode.nodeValue || '';
  const offset = range.startOffset;

  let start = offset;
  while (start > 0 && /[a-zA-Z'-]/.test(text[start - 1])) start--;

  let end = offset;
  while (end < text.length && /[a-zA-Z'-]/.test(text[end])) end++;

  if (start === end) return null;

  const word = text.substring(start, end);
  const wordRange = document.createRange();
  wordRange.setStart(textNode, start);
  wordRange.setEnd(textNode, end);

  return { word, range: wordRange };
}

function injectStyles() {
  const style = document.createElement('style');
  style.id = 'rttr-injected-styles';
  style.textContent = `
    .rttr-word {
      color: var(--rttr-color, #4a90d9);
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
      color: var(--rttr-color-hover, #2a70b9);
    }
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
      transform: translateY(0.15em);
      transition: all 0.2s ease;
    }
    ruby.rttr-word:hover rt.rttr-translation {
      opacity: 1;
    }
    [data-rttr-annotated="true"] {
      line-height: 1.8 !important;
    }
    .rttr-word.rttr-dismissing {
      opacity: 0;
      transform: scale(0.95);
      transition: all 0.3s ease;
    }
    .rttr-word.rttr-is-dragging {
      color: transparent !important;
      background-color: rgba(0, 0, 0, 0.04);
      border-radius: 4px;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
      outline: 1.5px dashed rgba(0, 0, 0, 0.2);
      outline-offset: 2px;
      transition: all 0.2s ease;
      cursor: grabbing !important;
    }
    .rttr-word.rttr-is-dragging rt.rttr-translation {
      color: transparent !important;
    }
    .rttr-word.rttr-will-snap-back {
      background-color: rgba(74, 144, 217, 0.1) !important;
      outline: 2px dashed rgba(74, 144, 217, 0.9) !important;
      outline-offset: 3px !important;
      box-shadow: inset 0 0 6px rgba(74, 144, 217, 0.2), 0 0 12px rgba(74, 144, 217, 0.4) !important;
      transform: scale(1.04);
      transition: all 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
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
  `;
  document.head.appendChild(style);
}
