import { safeSendMessage, showErrorToast } from '@/utils/content-messaging';
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
  translationPart: string;
  groupId?: string; // set for multi-segment annotations (used for floating translation)
}

export function findParagraph(el: HTMLElement | null): HTMLElement | null {
  while (el && el.tagName !== 'BODY' && el.tagName !== 'MAIN') {
    if (el.classList?.contains('rttr-paragraph-translation')) {
      const orig = (el as any)._rttr_original_paragraph;
      if (orig) return orig;
      const prev = el.previousElementSibling as HTMLElement;
      if (prev) return prev;
      return null;
    }
    if (el.classList && BLOCK_TAGS.has(el.tagName)) return el;
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
  console.log('[RTTR-DEBUG] applyAnnotations called for paragraph:', paragraph.innerText.slice(0, 30) + '...');
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

  // Pre-calculate translation parts for all annotations
  const annotationTranslationParts = new Map<AnnotationEntry, Map<number, string>>();
  const multiNodeGroupIds = new Map<AnnotationEntry, string>();
  for (const entry of annotations) {
    const rawTranslation = entry.translation || '';
    const isSame = entry.text.toLowerCase() === rawTranslation.toLowerCase();
    const translation = isSame ? '' : rawTranslation;

    const intersectingNodes: Array<{ idx: number; overlap: number }> = [];
    for (let i = 0; i < textNodes.length; i++) {
      const tn = textNodes[i];
      if (entry.start >= tn.end || entry.end <= tn.start) continue;
      const overlap = Math.min(entry.end, tn.end) - Math.max(entry.start, tn.start);
      if (overlap > 0) {
        intersectingNodes.push({ idx: i, overlap });
      }
    }

    const partsMap = new Map<number, string>();
    if (intersectingNodes.length === 1) {
      partsMap.set(intersectingNodes[0].idx, translation);
    } else if (intersectingNodes.length > 1) {
      // Multi-node: full translation on first segment, empty on rest; will be merged later
      const gid = `g-${entry.start}-${entry.end}`;
      multiNodeGroupIds.set(entry, gid);
      for (let j = 0; j < intersectingNodes.length; j++) {
        partsMap.set(intersectingNodes[j].idx, j === 0 ? translation : '');
      }
    }
    annotationTranslationParts.set(entry, partsMap);
  }

  const replacementsByParent = new Map<Node, Array<{ original: Text; fragment: DocumentFragment }>>();

  for (let i = 0; i < textNodes.length; i++) {
    const textNode = textNodes[i];
    const localAnnotations = annotations
      .filter((entry) => entry.start < textNode.end && entry.end > textNode.start)
      .map((entry) => {
        const partsMap = annotationTranslationParts.get(entry);
        const translationPart = partsMap?.get(i) ?? '';
        return {
          entry,
          start: Math.max(0, entry.start - textNode.start),
          end: Math.min(textNode.end, entry.end) - textNode.start,
          translationPart,
          groupId: multiNodeGroupIds.get(entry),
        };
      })
      .filter((item) => item.end > item.start);

    const fragment = annotateTextNode(textNode.node, localAnnotations, currentSettings, isLongPressFired);
    if (fragment) {
      const parent = textNode.node.parentNode;
      if (parent) {
        if (!replacementsByParent.has(parent)) {
          replacementsByParent.set(parent, []);
        }
        replacementsByParent.get(parent)!.push({ original: textNode.node, fragment });
      }
    }
  }

  for (const [parent, list] of replacementsByParent.entries()) {
    const newChildren: Node[] = [];
    for (const child of Array.from(parent.childNodes)) {
      const replacement = list.find((r) => r.original === child);
      if (replacement) {
        newChildren.push(...Array.from(replacement.fragment.childNodes));
      } else {
        newChildren.push(child);
      }
    }
    if (parent instanceof Element) {
      parent.replaceChildren(...newChildren);
    } else {
      while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
      }
      for (const child of newChildren) {
        parent.appendChild(child);
      }
    }
  }

  // Post-processing: merge multi-segment <ruby> elements with the same group into a single <ruby>
  mergeGroupedRubyElements(paragraph);
}

/**
 * Merge adjacent <ruby> elements that share the same data-rttr-group into a single <ruby>.
 * This allows translations of multi-word phrases (spanning DOM boundaries like <a> tags)
 * to be centered over the entire phrase instead of split into fragments.
 */
function mergeGroupedRubyElements(container: HTMLElement) {
  const grouped = new Map<string, HTMLElement[]>();
  container.querySelectorAll('ruby[data-rttr-group]').forEach(el => {
    const gid = (el as HTMLElement).dataset.rttrGroup!;
    if (!grouped.has(gid)) grouped.set(gid, []);
    grouped.get(gid)!.push(el as HTMLElement);
  });

  for (const [, elements] of grouped) {
    if (elements.length < 2) continue;

    const first = elements[0];
    // Find the <rt> with the full translation (on the first element)
    const firstRt = first.querySelector('rt.rttr-translation');
    const fullTranslation = firstRt?.textContent || '';

    // Remove the <rt> from first element temporarily
    if (firstRt) firstRt.remove();

    // For each subsequent element in the group, collect its content and merge into first <ruby>
    for (let i = 1; i < elements.length; i++) {
      const el = elements[i];
      const rt = el.querySelector('rt.rttr-translation');
      if (rt) rt.remove();

      // Collect all intermediate nodes between previous group element and current one
      // Then unwrap the current <ruby> and move its content + any wrapper (like <a>) into first
      const prevEl = elements[i - 1];
      const nodesInBetween = collectNodesBetween(prevEl, el);

      // Move intermediate nodes (whitespace, other inline elements) into first <ruby>
      for (const node of nodesInBetween) {
        first.appendChild(node);
      }

      // If the <ruby> is wrapped by an inline element (like <a>), preserve that wrapper
      const parent = el.parentElement;
      if (parent && parent !== first.parentElement && isInlineWrapper(parent)) {
        // Move all children out of the <ruby> into its parent wrapper
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
        // Move the wrapper (e.g. <a>) into the first <ruby>
        first.appendChild(parent);
      } else {
        // Same parent - just unwrap the <ruby> and move its children
        while (el.firstChild) first.appendChild(el.firstChild);
        el.remove();
      }
    }

    // Re-add the <rt> with the full translation at the end of the merged <ruby>
    const rt = document.createElement('rt');
    rt.className = 'rttr-translation';
    rt.textContent = fullTranslation;
    rt.style.color = first.style.color || 'inherit';
    first.appendChild(rt);
  }
}

/** Collect all sibling nodes between `start` (exclusive) and `end` (exclusive) at the same level. */
function collectNodesBetween(start: Node, end: Node): Node[] {
  const result: Node[] = [];
  // If they share the same parent, collect direct siblings
  if (start.parentNode === end.parentNode) {
    let node = start.nextSibling;
    while (node && node !== end) {
      result.push(node);
      node = node.nextSibling;
    }
    return result;
  }
  // If end is inside a wrapper (like <a>), collect nodes between start and that wrapper
  const endWrapper = end.parentElement;
  if (endWrapper && start.parentNode === endWrapper.parentNode) {
    let node = start.nextSibling;
    while (node && node !== endWrapper) {
      result.push(node);
      node = node.nextSibling;
    }
  }
  return result;
}

function isInlineWrapper(el: HTMLElement): boolean {
  const tag = el.tagName;
  return tag === 'A' || tag === 'SPAN' || tag === 'EM' || tag === 'STRONG' ||
    tag === 'B' || tag === 'I' || tag === 'U' || tag === 'MARK' || tag === 'ABBR' ||
    tag === 'CODE' || tag === 'SUB' || tag === 'SUP' || tag === 'FONT';
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

    if (shouldRenderRt(entry, annotation.translationPart)) {
      const rt = document.createElement('rt');
      rt.className = 'rttr-translation';
      rt.style.color = entry.importance === 'highlight' ? entry.color : 'inherit';
      rt.textContent = annotation.translationPart;

      wrapper.appendChild(rt);
    } else {
      // Continuation or no translation segment: add an empty <rt> to keep ruby layout consistent
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
        const target = e.target as HTMLElement;
        const clickY = e.clientY;
        const spanTarget = target.closest('span[data-idx]') as HTMLElement | null;
        
        // 1. Determine text to speak
        let textToSpeak = entry.pronunciation || part;
        if (spanTarget && spanTarget.dataset.idx) {
          textToSpeak = spanTarget.textContent || textToSpeak;
        } else {
          textToSpeak = part.trim();
        }
        const word = textToSpeak.trim();

        console.log('[RTTR-DEBUG] Click triggered', {
          word,
          isLongPress: isLongPressFired(),
          targetTag: target.tagName,
          isSpan: !!spanTarget
        });

        e.preventDefault();
        e.stopPropagation();

        if (isLongPressFired()) {
          console.log('[RTTR-DEBUG] Click blocked by long press flag');
          return;
        }

        const clickRect = () => getLineRect(spanTarget || target, clickY);
        let ipaToShow = entry.ipa || '';

        // 2. Immediate feedback (Speech + Speaker Icon/Existing IPA)
        speakText(textToSpeak, currentSettings);
        
        const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
        
        // Show immediately to ensure responsiveness
        uiActions.showPronounceBadge(ipaToShow || speakerSVG, clickRect(), !ipaToShow, word);

        // 3. Async Translation
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
                currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true, false, null, textToSpeak);
            } else {
              showErrorToast(`Error: ${resp?.error || 'Unknown error'}`);
              uiActions.showTranslationBadge('AI 翻译中...', 'AI', clickRect(), true,
                currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true, false, null, textToSpeak);
              safeSendMessage({
                type: 'CONTEXTUAL_TRANSLATE',
                word: textToSpeak,
                sentence: textToSpeak
              }).then((aiResp: any) => {
                if (aiResp?.success && aiResp.translation) {
                  uiActions.showTranslationBadge(aiResp.translation, 'AI', clickRect(), true,
                    currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true, false, null, textToSpeak);
                } else {
                  uiActions.showTranslationBadge(aiResp?.error ? `AI 翻译失败: ${aiResp.error}` : 'AI 翻译失败', 'AI', clickRect(), true,
                    currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true, false, null, textToSpeak);
                }
              }).catch(() => {
                uiActions.showTranslationBadge('AI 翻译出错', 'AI', clickRect(), true,
                  currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true, false, null, textToSpeak);
              });
            }
          }).catch((err: any) => {
            showErrorToast(`Error: ${err?.message || 'Network error'}`);
            uiActions.showTranslationBadge('AI 翻译中...', 'AI', clickRect(), true,
              currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true, false, null, textToSpeak);
            safeSendMessage({
              type: 'CONTEXTUAL_TRANSLATE',
              word: textToSpeak,
              sentence: textToSpeak
            }).then((aiResp: any) => {
              if (aiResp?.success && aiResp.translation) {
                uiActions.showTranslationBadge(aiResp.translation, 'AI', clickRect(), true,
                  currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true, false, null, textToSpeak);
              } else {
                uiActions.showTranslationBadge(aiResp?.error ? `AI 翻译失败: ${aiResp.error}` : 'AI 翻译失败', 'AI', clickRect(), true,
                  currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true, false, null, textToSpeak);
              }
            }).catch(() => {
              uiActions.showTranslationBadge('AI 翻译出错', 'AI', clickRect(), true,
                currentSettings.translationPosition || 'bottom', currentSettings.showTranslationEngine ?? true, false, null, textToSpeak);
            });
          });
        }

        // 4. Async IPA Lookup
        const isSingleWord = !word.includes(' ') && /^[a-zA-Z'-]+$/.test(word);
        if (isSingleWord) {
          try {
            const resp = await safeSendMessage({ type: 'LOOKUP_IPA', word }) as { ipa: string | null };
            if (resp?.ipa) {
              console.log('[RTTR-DEBUG] IPA lookup success:', resp.ipa);
              ipaToShow = resp.ipa; 
              // Update badge with the new IPA
              uiActions.showPronounceBadge(ipaToShow, clickRect(), false, word);
              
              if (textToSpeak === (entry.pronunciation || part)) {
                entry.ipa = resp.ipa;
              }
            }
          } catch (err) {
            console.error('[RTTR-DEBUG] IPA lookup failed:', err);
          }
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

export function getDeepElementFromPoint(x: number, y: number): Element | null {
  let el = document.elementFromPoint(x, y);
  while (el && el.shadowRoot) {
    const deepEl = el.shadowRoot.elementFromPoint(x, y);
    if (deepEl === el || !deepEl) break;
    el = deepEl;
  }
  return el;
}

export function containsShadowAware(parent: Element, child: Node): boolean {
  let curr: Node | null = child;
  while (curr) {
    if (curr === parent) return true;
    if (curr instanceof ShadowRoot) {
      curr = curr.host;
    } else {
      curr = curr.parentNode;
    }
  }
  return false;
}

export function getDeepCaretRangeFromPoint(x: number, y: number): Range | null {
  // First try document.caretRangeFromPoint
  let range: Range | null = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }

  // If we got a range and the startContainer is a text node, verify if it is deep enough
  if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
    return range;
  }

  // If caretRangeFromPoint returned a non-text node (like an element or shadow host),
  // we use a deep element lookup and manual text-node collision detection!
  const elAtPoint = getDeepElementFromPoint(x, y);
  if (!elAtPoint) return null;

  // Let's gather all text nodes inside elAtPoint
  const textNodes: Text[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
    } else {
      let child = node.firstChild;
      while (child) {
        walk(child);
        child = child.nextSibling;
      }
    }
  };
  walk(elAtPoint);

  if (textNodes.length === 0) return null;

  // Find the text node and the character offset where the click happened
  let bestNode: Text | null = null;
  let bestOffset = 0;
  let minDistance = Infinity;

  const probeRange = document.createRange();
  for (const node of textNodes) {
    const len = node.textContent?.length || 0;
    for (let i = 0; i < len; i++) {
      probeRange.setStart(node, i);
      probeRange.setEnd(node, i + 1);
      const rects = probeRange.getClientRects();
      for (let j = 0; j < rects.length; j++) {
        const rect = rects[j];
        // Check if (x, y) is inside this character's bounding rect
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          const r = document.createRange();
          r.setStart(node, i);
          r.collapse(true);
          return r;
        }
        // Fallback to closest distance
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.pow(cx - x, 2) + Math.pow(cy - y, 2);
        if (dist < minDistance) {
          minDistance = dist;
          bestNode = node;
          bestOffset = i;
        }
      }
    }
  }

  if (bestNode) {
    const r = document.createRange();
    r.setStart(bestNode, bestOffset);
    r.collapse(true);
    return r;
  }

  return null;
}

