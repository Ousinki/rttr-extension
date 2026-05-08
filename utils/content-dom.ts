import { safeSendMessage } from '@/utils/content-messaging';
import { uiActions } from '@/utils/content-state';
import { speakText } from '@/utils/tts';

const RTTR_ATTR = 'data-rttr-annotated';

const ANNOTATION_COLORS = [
  '#5B9BD5', '#70AD47', '#ED7D31', '#A855F7', '#44BEC7', '#F472B6',
  '#FACC15', '#EF4444', '#6366F1', '#34D399', '#FB923C', '#C084FC',
];

export const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'PRE'
]);

export interface UndoAction {
  wrapper: HTMLElement;
  textNode: Text;
  word: string;
}

export const undoStack: UndoAction[] = [];

export function findParagraph(el: HTMLElement | null): HTMLElement | null {
  while (el && el.tagName !== 'BODY' && el.tagName !== 'MAIN') {
    if (BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

export function getSentenceAroundNode(node: Node): string {
  let block = node.parentElement;
  while (block && !BLOCK_TAGS.has(block.tagName)) {
    block = block.parentElement;
  }
  return block ? block.textContent?.trim() || '' : node.textContent || '';
}

export function applyAnnotations(
  paragraph: HTMLElement,
  results: any[],
  currentSettings: any,
  isLongPressFired: () => boolean
) {
  paragraph.setAttribute('data-rttr-original', paragraph.innerHTML);
  paragraph.setAttribute(RTTR_ATTR, 'true');

  const wordMap = new Map<string, any>();
  results.forEach(({ word, translation, explanation, pronunciation, ipa }, i) => {
    wordMap.set(word.toLowerCase(), {
      translation,
      explanation,
      pronunciation,
      ipa,
      color: ANNOTATION_COLORS[i % ANNOTATION_COLORS.length],
    });
  });

  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const fragment = annotateTextNode(textNode, wordMap, currentSettings, isLongPressFired);
    if (fragment) {
      textNode.replaceWith(fragment);
    }
  }
}

let isDraggingRttrWord = false;
export function getIsDraggingRttrWord() { return isDraggingRttrWord; }

function annotateTextNode(
  textNode: Node,
  wordMap: Map<string, any>,
  currentSettings: any,
  isLongPressFired: () => boolean
): DocumentFragment | null {
  const text = textNode.textContent || '';
  if (!text.trim()) return null;

  const escapedWords = Array.from(wordMap.keys())
    .sort((a, b) => b.length - a.length)
    .map((w) => {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const prefix = /^\w/.test(w) ? '\\b' : '';
      const suffix = /\w$/.test(w) ? '\\b' : '';
      return `${prefix}${escaped}${suffix}`;
    });

  if (escapedWords.length === 0) return null;

  const pattern = new RegExp(`(${escapedWords.join('|')})`, 'gi');
  const parts = text.split(pattern);

  if (parts.length <= 1) return null;

  let hasAnnotation = false;
  const fragment = document.createDocumentFragment();

  for (const part of parts) {
    const lower = part.toLowerCase();
    const entry = wordMap.get(lower);

    if (entry) {
      const isSameTranslation = part.toLowerCase() === entry.translation.toLowerCase();

      let wrapper = document.createElement('ruby');
      wrapper.className = 'rttr-word';
      wrapper.style.color = entry.color;
      
      const subWords = part.split(/(\s+)/);
      subWords.forEach((subWord, idx) => {
        if (subWord.trim()) {
          const span = document.createElement('span');
          span.textContent = subWord;
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
      rt.textContent = isSameTranslation ? '' : entry.translation;

      wrapper.appendChild(rt);

      if (entry.explanation) {
        wrapper.addEventListener('mouseenter', (e) => {
          const target = e.currentTarget as HTMLElement;
          uiActions.showTooltip(target.dataset.explanation || '', target.getBoundingClientRect());
        });
        wrapper.addEventListener('mouseleave', () => {
          uiActions.hideTooltip();
        });
      }

      wrapper.addEventListener('click', async (e) => {
        console.log('[RTTR] Clicked on word wrapper:', part);
        e.preventDefault();
        e.stopPropagation();
        
        if (isLongPressFired()) {
          console.log('[RTTR] isLongPressFired is true, ignoring click');
          return;
        }
        
        const target = e.target as HTMLElement;
        console.log('[RTTR] Click target:', target);
        let textToSpeak = entry.pronunciation || part;
        let ipaToShow = entry.ipa || '';

        if (target.tagName === 'SPAN' && target.dataset.idx) {
          const wordIdx = parseInt(target.dataset.idx, 10);
          if (ipaToShow) {
            const cleanIpa = ipaToShow.replace(/^\/|\/$/g, '').trim();
            const ipaParts = cleanIpa.split(/\s+/);
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

        console.log('[RTTR] Calling speakText with:', textToSpeak);
        speakText(textToSpeak, currentSettings);
        
        const engine = currentSettings?.translationEngine || 'google';
        if (engine !== 'none') {
           safeSendMessage({
            type: 'FETCH_TRANSLATION',
            text: textToSpeak,
            sourceLang: 'auto',
            targetLang: navigator.language.startsWith('zh') ? 'zh-CN' : 'zh-TW',
            engine
          }).then((resp: any) => {
            if (resp && resp.targetText) {
              uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, target.getBoundingClientRect(), true);
            }
          });
        }

        const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';

        console.log('[RTTR] Calling showPronounceBadge');
        if (ipaToShow) {
          uiActions.showPronounceBadge(ipaToShow, target.getBoundingClientRect());
        } else {
          const singleWord = textToSpeak.trim();
          if (!singleWord.includes(' ') && /^[a-zA-Z'-]+$/.test(singleWord)) {
            try {
              const resp = await safeSendMessage({ type: 'LOOKUP_IPA', word: singleWord }) as { ipa: string | null };
              if (resp?.ipa) {
                uiActions.showPronounceBadge(resp.ipa, target.getBoundingClientRect());
                if (textToSpeak === (entry.pronunciation || part)) {
                  entry.ipa = resp.ipa;
                }
                return;
              }
            } catch {}
          }
          uiActions.showPronounceBadge(speakerSVG, target.getBoundingClientRect(), true);
        }
      });

      wrapper.addEventListener('mousedown', () => { wrapper.draggable = true; });
      wrapper.addEventListener('mouseup', () => { wrapper.draggable = false; });
      wrapper.addEventListener('dragend', () => { wrapper.draggable = false; });

      let dragStartX = 0;
      let dragStartY = 0;

      wrapper.addEventListener('dragstart', (e) => {
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        isDraggingRttrWord = true;

        if (entry.explanation) uiActions.hideTooltip();
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', part);
          
          const dragImageContainer = document.createElement('div');
          dragImageContainer.style.position = 'absolute';
          dragImageContainer.style.top = '-10000px';
          dragImageContainer.style.left = '-10000px';
          dragImageContainer.style.padding = '20px';
          dragImageContainer.style.backgroundColor = 'transparent';
          
          const clone = wrapper.cloneNode(true) as HTMLElement;
          clone.classList.remove('rttr-is-dragging');
          dragImageContainer.appendChild(clone);
          
          document.body.appendChild(dragImageContainer);
          
          const rect = wrapper.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const offsetY = e.clientY - rect.top;
          e.dataTransfer.setDragImage(dragImageContainer, 20 + offsetX, 20 + offsetY);
          
          setTimeout(() => dragImageContainer.remove(), 0);
        }
        setTimeout(() => {
          wrapper.classList.add('rttr-is-dragging');
          wrapper.classList.add('rttr-will-snap-back');
        }, 0);
      });

      wrapper.addEventListener('drag', (e) => {
        if (e.clientX === 0 && e.clientY === 0) return;
        const distance = Math.sqrt(Math.pow(e.clientX - dragStartX, 2) + Math.pow(e.clientY - dragStartY, 2));
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
        
        const distance = Math.sqrt(Math.pow(e.clientX - dragStartX, 2) + Math.pow(e.clientY - dragStartY, 2));
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

export async function dismissWord(ruby: HTMLElement, word: string, originalText: string) {
  ruby.classList.add('rttr-dismissing');
  try {
    const response = await safeSendMessage({ type: 'DISMISS_WORD', word }) as any;
    if (response?.success) {
      setTimeout(() => {
        const textNode = document.createTextNode(originalText);
        ruby.replaceWith(textNode);
        undoStack.push({ wrapper: ruby, textNode, word });
        if (undoStack.length > 50) undoStack.shift();
      }, 300);
    } else {
      ruby.classList.remove('rttr-dismissing');
    }
  } catch (err) {
    ruby.classList.remove('rttr-dismissing');
  }
}

export async function undoDismiss(action: UndoAction) {
  const { wrapper, textNode, word } = action;
  try {
    const response = await safeSendMessage({ type: 'UNDISMISS_WORD', word }) as any;
    if (response?.success) {
      wrapper.classList.remove('rttr-dismissing');
      textNode.replaceWith(wrapper);
    } else {
      undoStack.push(action);
    }
  } catch (err) {
    undoStack.push(action);
  }
}

export function clearAnnotations(paragraph: HTMLElement) {
  const original = paragraph.getAttribute('data-rttr-original');
  if (original) paragraph.innerHTML = original;
  paragraph.removeAttribute(RTTR_ATTR);
  paragraph.removeAttribute('data-rttr-original');
}
