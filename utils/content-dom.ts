import { safeSendMessage } from '@/utils/content-messaging';
import { uiActions, setLastInteractionY, getLineRect } from '@/utils/content-state';
import { speakText } from '@/utils/tts';
import { findNumberConversions } from '@/utils/number-conversion';
import type { AnnotationResult } from '@/utils/ai';
import type { TranslationEngine } from '@/utils/messaging';

const RTTR_ATTR = 'data-rttr-annotated';

const ANNOTATION_COLORS = [
  '#5B9BD5', '#70AD47', '#ED7D31', '#A855F7', '#44BEC7', '#F472B6',
  '#FACC15', '#EF4444', '#6366F1', '#34D399', '#FB923C', '#C084FC',
];

export const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION', 'PRE'
]);

interface AnnotationEntry extends AnnotationResult {
  color: string;
}

interface LocalAnnotation {
  entry: AnnotationEntry;
  start: number;
  end: number;
  isFirst: boolean; // true = show <rt> translation; false = continuation segment
  groupId?: string; // set for multi-segment annotations (used for floating translation)
}

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
  results: AnnotationResult[],
  currentSettings: any,
  isLongPressFired: () => boolean
) {
  paragraph.setAttribute('data-rttr-original', paragraph.innerHTML);
  paragraph.setAttribute(RTTR_ATTR, 'true');

  let annotations = results
    .filter((item) => item.start >= 0 && item.end > item.start)
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce<AnnotationEntry[]>((acc, item, i) => {
      const prev = acc[acc.length - 1];
      if (prev && item.start < prev.end) return acc;
      acc.push({
        ...item,
        color: ANNOTATION_COLORS[i % ANNOTATION_COLORS.length],
      });
      return acc;
    }, []);

  // When number conversion is enabled, inject number annotations into the main pipeline
  if (currentSettings.enableNumberConversion) {
    const fullText = paragraph.textContent || '';
    const numberRanges = findNumberConversions(fullText);
    if (numberRanges.length > 0) {
      // Remove AI annotations that overlap with number patterns
      annotations = annotations.filter(
        a => !numberRanges.some(nr => a.start < nr.end && a.end > nr.start)
      );
      // Add number conversion entries as first-class annotations
      for (const nr of numberRanges) {
        annotations.push({
          text: nr.original,
          word: nr.original,
          start: nr.start,
          end: nr.end,
          importance: 'highlight' as const,
          translation: nr.converted,
          kind: 'number',
          color: '#888',
        });
      }
      // Re-sort and de-overlap
      annotations.sort((a, b) => a.start - b.start);
      annotations = annotations.reduce<AnnotationEntry[]>((acc, item) => {
        const prev = acc[acc.length - 1];
        if (prev && item.start < prev.end) return acc;
        acc.push(item);
        return acc;
      }, []);
    }
  }

  if (annotations.length === 0) return;

  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT, null);
  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  let textOffset = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const length = node.textContent?.length ?? 0;
    textNodes.push({ node, start: textOffset, end: textOffset + length });
    textOffset += length;
  }

  // Pre-pass: for each annotation, find which text node has the largest overlap.
  // The <rt> translation will be shown ONLY on that segment.
  const primaryNodeIndex = new Map<AnnotationEntry, number>();
  for (const entry of annotations) {
    let bestIdx = -1;
    let bestSize = 0;
    for (let i = 0; i < textNodes.length; i++) {
      const tn = textNodes[i];
      if (entry.start >= tn.end || entry.end <= tn.start) continue;
      const size = Math.min(entry.end, tn.end) - Math.max(entry.start, tn.start);
      if (size > bestSize) {
        bestSize = size;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) primaryNodeIndex.set(entry, bestIdx);
  }

  for (let i = 0; i < textNodes.length; i++) {
    const textNode = textNodes[i];
    const localAnnotations = annotations
      .filter((entry) => entry.start < textNode.end && entry.end > textNode.start)
      .map((entry) => ({
        entry,
        start: Math.max(0, entry.start - textNode.start),
        end: Math.min(textNode.end, entry.end) - textNode.start,
        // Show <rt> only on the primary (largest) segment
        isFirst: primaryNodeIndex.get(entry) === i,
      }))
      .filter((item) => item.end > item.start);

    const fragment = annotateTextNode(textNode.node, localAnnotations, currentSettings, isLongPressFired);
    if (fragment) {
      textNode.node.replaceWith(fragment);
    }
  }
}

function annotateTextNode(
  textNode: Node,
  annotations: LocalAnnotation[],
  currentSettings: any,
  isLongPressFired: () => boolean
): DocumentFragment | null {
  const text = textNode.textContent || '';
  if (!text.trim() || annotations.length === 0) return null;

  let hasAnnotation = false;
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const annotation of annotations) {
    if (annotation.start > cursor) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, annotation.start)));
    }

    const part = text.slice(annotation.start, annotation.end);
    const entry = annotation.entry;
    const translation = entry.translation || '';
    const lower = part.toLowerCase();
    const isSameTranslation = part.toLowerCase() === translation.toLowerCase();

    let wrapper = document.createElement('ruby');
    wrapper.className = getAnnotationClassName(entry);
    wrapper.style.setProperty('--rttr-token-color', entry.color);
    wrapper.style.color = entry.importance === 'highlight' ? entry.color : 'inherit';

    // Tag multi-segment phrases for post-pass floating translation positioning
    if (annotation.groupId) {
      wrapper.dataset.rttrGroup = annotation.groupId;
    }
      
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

    if (isBackgroundKnowledgeToken(entry)) {
      wrapper.dataset.explanation = entry.explanation;
      wrapper.classList.add('rttr-has-tooltip');
    }

    // Only show <rt> translation on the first segment of a cross-node phrase
    if (annotation.isFirst && shouldRenderRt(entry, translation)) {
      const rt = document.createElement('rt');
      rt.className = 'rttr-translation';
      rt.style.color = entry.importance === 'highlight' ? entry.color : 'inherit';
      rt.textContent = isSameTranslation ? '' : translation;

      wrapper.appendChild(rt);
    } else if (!annotation.isFirst) {
      // Continuation segment: add an empty <rt> to keep ruby layout consistent
      const rt = document.createElement('rt');
      rt.className = 'rttr-translation';
      rt.textContent = '';
      wrapper.appendChild(rt);
    }

    if (isBackgroundKnowledgeToken(entry)) {
      wrapper.addEventListener('mouseenter', (e) => {
        const target = e.currentTarget as HTMLElement;
        setLastInteractionY(e.clientY);
        uiActions.showTooltip(target.dataset.explanation || '', getLineRect(target, e.clientY));
      });
      wrapper.addEventListener('mouseleave', () => {
        uiActions.hideTooltip();
      });
    }

      wrapper.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (isLongPressFired()) {
          return;
        }
        
        const target = e.target as HTMLElement;
        const clickY = e.clientY;
        const clickRect = () => getLineRect(target, clickY);
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

        speakText(textToSpeak, currentSettings);
        
        const engine = currentSettings?.translationEngine || 'google';
        if (engine !== 'none') {
           safeSendMessage({
            type: 'FETCH_TRANSLATION',
            text: textToSpeak,
            sourceLang: 'auto',
            targetLang: currentSettings.targetLanguage || 'zh-CN',
            engine
          }).then((resp: any) => {
            if (resp && resp.targetText) {
              uiActions.showTranslationBadge(resp.targetText, resp.engine || engine, clickRect(), true,
                currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true);
            }
          });
        }

        const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';

        if (ipaToShow) {
          uiActions.showPronounceBadge(ipaToShow, clickRect());
        } else {
          const singleWord = textToSpeak.trim();
          if (!singleWord.includes(' ') && /^[a-zA-Z'-]+$/.test(singleWord)) {
            try {
              const resp = await safeSendMessage({ type: 'LOOKUP_IPA', word: singleWord }) as { ipa: string | null };
              if (resp?.ipa) {
                uiActions.showPronounceBadge(resp.ipa, clickRect());
                if (textToSpeak === (entry.pronunciation || part)) {
                  entry.ipa = resp.ipa;
                }
                return;
              }
            } catch {}
          }
          uiActions.showPronounceBadge(speakerSVG, clickRect(), true);
        }
      });




    fragment.appendChild(wrapper);
    hasAnnotation = true;
    cursor = annotation.end;
  }

  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
  }

  return hasAnnotation ? fragment : null;
}

function isBackgroundKnowledgeToken(entry: AnnotationEntry): boolean {
  return !!entry.explanation && ['name', 'place', 'organization', 'event', 'other'].includes(entry.kind || '');
}

function getAnnotationClassName(entry: AnnotationEntry): string {
  return 'rttr-word rttr-word-highlight';
}

function shouldRenderRt(entry: AnnotationEntry, translation: string): boolean {
  if (entry.kind === 'name' && !translation) return false;
  if (entry.kind === 'number' && !translation) return false;
  return !!translation;
}



export function clearAnnotations(paragraph: HTMLElement) {
  const original = paragraph.getAttribute('data-rttr-original');
  if (original) paragraph.innerHTML = original;
  paragraph.removeAttribute(RTTR_ATTR);
  paragraph.removeAttribute('data-rttr-original');
}
