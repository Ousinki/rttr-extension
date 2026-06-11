import { findParagraph, BLOCK_TAGS } from '@/utils/content-dom';
import type { RTTRSettings as Settings } from '@/utils/storage';

// --- Data Structures ---

interface SentenceBoundary {
  startOffset: number;
  endOffset: number;
}

interface BlockSentenceData {
  block: Element;
  boundaries: SentenceBoundary[];
  fullText: string;
}

interface FocusStateInternal {
  allRanges: Range[];
  currentIdx: number;
}

// --- Module State ---

const sentenceStore = new WeakMap<Element, BlockSentenceData>();
let splitBlocks: Set<Element> = new Set();
let focusState: FocusStateInternal | null = null;
let currentSettings: Settings | null = null;
let activeHighlightSpans: HTMLSpanElement[] = [];

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, article > div, section > div, main > div';
const SKIP_SELECTOR = 'nav, header, footer, code, pre, script, style, rttr-ui-root';

// --- Public API ---

export function initSentenceFocus(settings: Settings | null) {
  currentSettings = settings;
}

export function isSplitActive(): boolean {
  return splitBlocks.size > 0;
}

export function isFocused(): boolean {
  return focusState !== null;
}



export function splitBlock(node: Node): void {
  const block = findParagraph(node as HTMLElement);
  if (!block) return;

  if (sentenceStore.has(block)) {
    removeSplitFromBlock(block);
    return;
  }
  splitBlockElement(block);
}

export function removeSplits(): void {
  unfocusSentence();
  document.querySelectorAll('.rttr-sentence-sep').forEach(sep => sep.remove());
  document.querySelectorAll('[data-rttr-split]').forEach(el => el.removeAttribute('data-rttr-split'));
  for (const block of splitBlocks) {
    sentenceStore.delete(block);
  }
  splitBlocks.clear();
}

export function focusSentenceAtSeparator(sepEl: HTMLElement): void {
  const block = sepEl.closest('[data-rttr-split="true"]');
  if (!block) return;

  const data = sentenceStore.get(block);
  if (!data) return;

  const sepIndex = getSeparatorIndex(sepEl, block);
  const sentenceIdx = sepIndex; // separator after sentence N has index N

  const allRanges = rebuildAllRanges();
  if (allRanges.length === 0) return;

  // Find the global index for this block's sentence
  let globalIdx = findGlobalIndex(block, sentenceIdx, allRanges);
  if (globalIdx === -1) globalIdx = 0;

  if (focusState && focusState.currentIdx === globalIdx) {
    unfocusSentence();
  } else {
    focusState = { allRanges, currentIdx: globalIdx };
    applyFocusHighlight();
  }
}

/** Split the paragraph (if not already) and focus the sentence at the given node — one-step action. */
export function splitAndFocusAtNode(node: Node, offsetInNode: number = 0): void {
  const block = findParagraph(node as HTMLElement);
  if (!block) return;

  // Only allow on block elements (handled by findParagraph)

  // Compute the character offset of `node` within the block BEFORE splitting
  // (because splitting replaces text nodes, invalidating the original reference)
  const textOffset = getNodeOffsetInBlock(block, node, offsetInNode);

  // Split if not already split
  if (!sentenceStore.has(block)) {
    splitBlockElement(block);
    // If the block had only 1 sentence, splitBlockElement won't mark it — bail out
    if (!sentenceStore.has(block)) return;
  }

  // Find the correct sentence in THIS block using the pre-computed offset
  const data = sentenceStore.get(block);
  if (!data) return;

  let targetSentenceIdx = 0;
  for (let i = 0; i < data.boundaries.length; i++) {
    if (textOffset >= data.boundaries[i].startOffset && textOffset < data.boundaries[i].endOffset) {
      targetSentenceIdx = i;
      break;
    }
  }

  // Rebuild all ranges and find the global index for this block's target sentence
  const allRanges = rebuildAllRanges();
  if (allRanges.length === 0) return;

  const blockRanges = rebuildRangesForBlock(data);
  const targetRange = blockRanges[targetSentenceIdx];

  let globalIdx = 0;
  if (targetRange) {
    for (let i = 0; i < allRanges.length; i++) {
      try {
        if (allRanges[i].startContainer === targetRange.startContainer &&
            allRanges[i].startOffset === targetRange.startOffset) {
          globalIdx = i;
          break;
        }
      } catch { /* skip */ }
    }
  }

  focusState = { allRanges, currentIdx: globalIdx };
  applyFocusHighlight();
}

export function focusSentenceAtNode(node: Node): void {
  const allRanges = rebuildAllRanges();
  if (allRanges.length === 0) return;

  let idx = -1;
  let minLength = Infinity;

  for (let i = 0; i < allRanges.length; i++) {
    try {
      let match = false;
      if (allRanges[i].isPointInRange(node, 0)) match = true;
      else if (allRanges[i].intersectsNode(node)) match = true;

      if (match) {
        const len = allRanges[i].toString().length;
        if (len < minLength) {
          minLength = len;
          idx = i;
        }
      }
    } catch { /* skip */ }
  }

  if (idx === -1) return; // No matching sentence found — don't jump to a random one
  focusState = { allRanges, currentIdx: idx };
  applyFocusHighlight();
}

export function focusNext(): void {
  if (!focusState) return;
  const allRanges = rebuildAllRanges();
  if (allRanges.length === 0) { unfocusSentence(); return; }
  const next = Math.min(focusState.currentIdx + 1, allRanges.length - 1);
  focusState = { allRanges, currentIdx: next };
  applyFocusHighlight();
}

export function focusPrev(): void {
  if (!focusState) return;
  const allRanges = rebuildAllRanges();
  if (allRanges.length === 0) { unfocusSentence(); return; }
  const prev = Math.max(focusState.currentIdx - 1, 0);
  focusState = { allRanges, currentIdx: prev };
  applyFocusHighlight();
}

const FOCUS_HIGHLIGHT_KEYS = [
  'rttr-sentence-dim',
  'rttr-sentence-hl-yellow',
  'rttr-sentence-hl-blue',
  'rttr-sentence-hl-red'
];

export function clearFocusHighlights(): void {
  const cssObj = CSS as any;
  if (cssObj.highlights) {
    for (const key of FOCUS_HIGHLIGHT_KEYS) {
      cssObj.highlights.delete(key);
    }
  }
  clearDOMHighlights();
}

export function unfocusSentence(): void {
  focusState = null;
  clearFocusHighlights();
}

export function refreshFocusHighlight(): void {
  if (focusState) {
    applyFocusHighlight();
  }
}

export function getFocusedSentenceText(): string | null {
  if (!focusState) return null;
  try {
    // When DOM highlight spans are active, the original Range is invalidated
    // by surroundContents(). Use the spans' text content instead.
    if (activeHighlightSpans.length > 0) {
      let text = activeHighlightSpans.map(s => s.textContent || '').join('');
      text = text.replace(/◯/g, '');
      text = text.replace(/\[\d+\]/g, '');
      return text.trim() || null;
    }
    let text = focusState.allRanges[focusState.currentIdx]?.toString() || '';
    text = text.replace(/◯/g, '');
    text = text.replace(/\[\d+\]/g, '');
    return text.trim() || null;
  } catch { return null; }
}

export function getFocusedSentenceRect(): DOMRect | null {
  if (!focusState) return null;
  try {
    // When DOM highlight spans are active, compute a bounding rect
    // from the spans since the original Range is invalidated by surroundContents().
    if (activeHighlightSpans.length > 0) {
      let minLeft = Infinity, minTop = Infinity;
      let maxRight = -Infinity, maxBottom = -Infinity;
      for (const span of activeHighlightSpans) {
        const r = span.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        minLeft = Math.min(minLeft, r.left);
        minTop = Math.min(minTop, r.top);
        maxRight = Math.max(maxRight, r.right);
        maxBottom = Math.max(maxBottom, r.bottom);
      }
      if (minLeft !== Infinity) {
        return new DOMRect(minLeft, minTop, maxRight - minLeft, maxBottom - minTop);
      }
    }
    return focusState.allRanges[focusState.currentIdx]?.getBoundingClientRect() || null;
  } catch { return null; }
}

export function handleSeparatorClick(e: MouseEvent): void {
  if (!currentSettings?.enabled) return;

  const target = e.target as HTMLElement;
  if (!target.classList.contains('rttr-sentence-sep')) return;
  if (target.classList.contains('rttr-sentence-sep--hidden')) return;

  e.preventDefault();
  e.stopPropagation();

  focusSentenceAtSeparator(target);
}

// --- Internal: Splitting ---

function splitBlockElement(block: Element): void {
  if (block.closest(SKIP_SELECTOR)) return;

  const boundaries = computeSentenceBoundaries(block);
  if (boundaries.length === 0) return;

  const fullText = collectBlockText(block);

  sentenceStore.set(block, { block, boundaries, fullText });
  splitBlocks.add(block);

  if (boundaries.length > 1) {
    insertVisualSeparators(block, boundaries);
  }
  block.setAttribute('data-rttr-split', 'true');
}

function removeSplitFromBlock(block: Element): void {
  block.querySelectorAll('.rttr-sentence-sep').forEach(sep => sep.remove());
  block.removeAttribute('data-rttr-split');
  sentenceStore.delete(block);
  splitBlocks.delete(block);
}

function getForcedBreaks(block: Element, skipSeparators: boolean): Set<number> {
  const breaks = new Set<number>();
  let cum = 0;
  
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_ALL, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('script, style, rt, rp')) return NodeFilter.FILTER_REJECT;
        if (skipSeparators && parent.closest('.rttr-sentence-sep')) return NodeFilter.FILTER_REJECT;
        if (!skipSeparators && parent.closest('.rttr-sentence-sep, [data-rttr-split="true"] [data-rttr-split="true"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (['SCRIPT', 'STYLE', 'RT', 'RP'].includes(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (BLOCK_TAGS.has(el.tagName) || el.tagName === 'BR' || el.tagName === 'HR') {
          breaks.add(cum);
        }
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_SKIP;
    }
  });

  let nd: Node | null;
  while ((nd = walker.nextNode())) {
    if (nd.nodeType === Node.TEXT_NODE) {
      cum += nd.textContent?.length || 0;
    }
  }
  return breaks;
}

function computeSentenceBoundaries(block: Element): SentenceBoundary[] {
  const textNodes = collectTextNodes(block, false);
  if (textNodes.length === 0) return [];
  
  const forcedBreaks = getForcedBreaks(block, false);

  const blockText = textNodes.map(t => t.textContent || '').join('');
  if (blockText.trim().length < 20) return [];

  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const cleanText = blockText.replace(/\[.*?\]/g, match => ' '.repeat(match.length));
  const segments = Array.from(segmenter.segment(cleanText));

  const boundaries: SentenceBoundary[] = [];
  for (const seg of segments) {
    let currentStart = seg.index;
    const segEnd = seg.index + seg.segment.length;
    
    for (let i = currentStart + 1; i < segEnd; i++) {
      if (forcedBreaks.has(i)) {
        const textPart = blockText.slice(currentStart, i);
        const trimmed = textPart.replace(/\s+$/, '');
        if (trimmed.trim().length > 0) {
          boundaries.push({ startOffset: currentStart, endOffset: currentStart + trimmed.length });
        }
        currentStart = i;
      }
    }
    
    const textPart = blockText.slice(currentStart, segEnd);
    const trimmed = textPart.replace(/\s+$/, '');
    if (trimmed.trim().length > 0) {
      boundaries.push({ startOffset: currentStart, endOffset: currentStart + trimmed.length });
    }
  }

  return boundaries;
}

function insertVisualSeparators(block: Element, boundaries: SentenceBoundary[]): void {
  const textNodes = collectTextNodes(block, false);
  if (textNodes.length === 0) return;

  const offsetMap = buildOffsetMap(textNodes);

  // Collect insertion points (between sentences = endOffset of sentence i, for i < last)
  const insertionPoints: { nodeIdx: number; localOffset: number }[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const pos = boundaries[i].endOffset;
    const target = findNodeAtOffset(offsetMap, pos);
    if (!target) continue;
    insertionPoints.push({ nodeIdx: target.nodeIdx, localOffset: target.localOffset });
  }

  // Group by node index, process in reverse to preserve offsets
  const nodeGroups = new Map<number, number[]>();
  for (const pt of insertionPoints) {
    if (!nodeGroups.has(pt.nodeIdx)) nodeGroups.set(pt.nodeIdx, []);
    nodeGroups.get(pt.nodeIdx)!.push(pt.localOffset);
  }

  const sortedNodeIdxs = [...nodeGroups.keys()].sort((a, b) => b - a);
  for (const nodeIdx of sortedNodeIdxs) {
    const entry = offsetMap[nodeIdx];
    const nodeText = entry.node.textContent || '';
    const splits = nodeGroups.get(nodeIdx)!.sort((a, b) => a - b);

    const frag = document.createDocumentFragment();
    let lastEnd = 0;
    for (const splitPos of splits) {
      const beforeText = nodeText.slice(lastEnd, splitPos);
      if (beforeText) frag.appendChild(document.createTextNode(beforeText));

      const sep = document.createElement('span');
      sep.className = 'rttr-sentence-sep';
      sep.textContent = ' ◯ ';
      sep.setAttribute('aria-hidden', 'true');
      frag.appendChild(sep);

      lastEnd = splitPos;
    }
    const remaining = nodeText.slice(lastEnd);
    if (remaining) frag.appendChild(document.createTextNode(remaining));
    entry.node.parentNode?.replaceChild(frag, entry.node);
  }

  // Post-process: Move separators out of <sup>, <sub> or <a> elements to keep styling clean
  block.querySelectorAll('.rttr-sentence-sep').forEach((sep) => {
    let parent = sep.parentElement;
    let containerToMoveAfter: HTMLElement | null = null;
    while (parent && parent !== block) {
      if (parent.tagName === 'SUP' || parent.tagName === 'SUB' || parent.tagName === 'A') {
        containerToMoveAfter = parent as HTMLElement;
      }
      parent = parent.parentElement;
    }
    if (containerToMoveAfter && containerToMoveAfter.parentNode) {
      containerToMoveAfter.parentNode.insertBefore(sep, containerToMoveAfter.nextSibling);
    }
  });
}

// --- Internal: DOM Highlights (Fallback for Chromium background highlight bugs) ---

function clearDOMHighlights(): void {
  for (const span of activeHighlightSpans) {
    if (span.parentNode) {
      const parent = span.parentNode;
      const fragment = document.createDocumentFragment();
      while (span.firstChild) {
        fragment.appendChild(span.firstChild);
      }
      parent.replaceChild(fragment, span);
    }
  }
  activeHighlightSpans = [];
}

function applyDOMHighlight(ranges: Range[], style: string): void {
  clearDOMHighlights();

  for (const range of ranges) {
    try {
      const span = document.createElement('span');
      span.className = `rttr-sentence-highlight rttr-sentence-${style}`;
      range.surroundContents(span);
      activeHighlightSpans.push(span);
    } catch (err) {
      console.error('[RTTR-DEBUG] Failed to surround range with span:', err);
    }
  }
}

// --- Internal: Range Reconstruction ---

function rebuildAllRanges(): Range[] {
  clearDOMHighlights();
  const allRanges: Range[] = [];

  // Collect blocks in document order
  const blocks = Array.from(splitBlocks).filter(b => document.contains(b));
  blocks.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  for (const block of blocks) {
    const data = sentenceStore.get(block);
    if (!data) continue;
    const ranges = rebuildRangesForBlock(data);
    allRanges.push(...ranges);
  }

  return allRanges;
}

function rebuildRangesForBlock(data: BlockSentenceData): Range[] {
  const block = data.block;
  if (!document.contains(block)) return [];

  const textNodes = collectTextNodes(block, true);
  if (textNodes.length === 0) return [];

  const offsetMap = buildOffsetMap(textNodes);
  const ranges: Range[] = [];

  console.log('[RTTR-DEBUG] rebuildRangesForBlock textNodes count:', textNodes.length);
  for (let idx = 0; idx < data.boundaries.length; idx++) {
    const boundary = data.boundaries[idx];
    const startPos = findNodeAtOffset(offsetMap, boundary.startOffset);
    const endPos = findNodeAtOffset(offsetMap, boundary.endOffset);
    
    if (!startPos || !endPos) {
      console.log(`[RTTR-DEBUG] boundary ${idx} failed to resolve start/end:`, startPos, endPos);
      continue;
    }

    try {
      const range = document.createRange();
      range.setStart(offsetMap[startPos.nodeIdx].node, startPos.localOffset);
      range.setEnd(offsetMap[endPos.nodeIdx].node, endPos.localOffset);
      
      console.log(`[RTTR-DEBUG] boundary ${idx} resolved:`, {
        startNodeIdx: startPos.nodeIdx,
        startOffset: startPos.localOffset,
        startText: offsetMap[startPos.nodeIdx].node.textContent?.slice(0, 20),
        endNodeIdx: endPos.nodeIdx,
        endOffset: endPos.localOffset,
        endText: offsetMap[endPos.nodeIdx].node.textContent?.slice(0, 20),
        rangeText: range.toString().slice(0, 60) + '...'
      });

      if (range.toString().trim().length > 0) {
        ranges.push(range);
      }
    } catch (err) {
      console.error(`[RTTR-DEBUG] boundary ${idx} failed to construct range:`, err);
    }
  }

  return ranges;
}

// --- Internal: Focus Highlight ---

function splitRangeIntoTextRanges(range: Range): Range[] {
  const startNode = range.startContainer;
  const endNode = range.endContainer;

  if (startNode === endNode) {
    const trimmed = trimTextRange(range);
    return trimmed ? [trimmed] : [range];
  }

  const ranges: Range[] = [];
  const commonAncestor = range.commonAncestorContainer;
  
  const walker = document.createTreeWalker(
    commonAncestor,
    NodeFilter.SHOW_TEXT
  );

  let started = false;
  let node = walker.nextNode();
  while (node) {
    if (node === startNode) {
      started = true;
    }
    if (started) {
      const textNode = node as Text;
      const r = document.createRange();
      
      let startOffset = 0;
      let endOffset = textNode.textContent?.length ?? 0;
      
      if (textNode === startNode) {
        startOffset = range.startOffset;
      }
      if (textNode === endNode) {
        endOffset = range.endOffset;
      }
      
      // Trim leading and trailing whitespaces of this text node within the range
      const text = textNode.textContent || '';
      while (startOffset < endOffset && /\s/.test(text[startOffset])) {
        startOffset++;
      }
      while (endOffset > startOffset && /\s/.test(text[endOffset - 1])) {
        endOffset--;
      }
      
      if (startOffset < endOffset) {
        r.setStart(textNode, startOffset);
        r.setEnd(textNode, endOffset);
        ranges.push(r);
      }
      
      if (node === endNode) {
        break;
      }
    }
    node = walker.nextNode();
  }

  return ranges.length > 0 ? ranges : [range];
}

function trimTextRange(range: Range): Range | null {
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const textNode = range.startContainer as Text;
  const text = textNode.textContent || '';
  
  let startOffset = range.startOffset;
  let endOffset = range.endOffset;
  
  while (startOffset < endOffset && /\s/.test(text[startOffset])) {
    startOffset++;
  }
  while (endOffset > startOffset && /\s/.test(text[endOffset - 1])) {
    endOffset--;
  }
  
  if (startOffset >= endOffset) return null;
  
  try {
    const r = document.createRange();
    r.setStart(textNode, startOffset);
    r.setEnd(textNode, endOffset);
    return r;
  } catch {
    return null;
  }
}

function applyFocusHighlight(): void {
  if (!focusState) return;
  const focused = focusState.allRanges[focusState.currentIdx];
  if (!focused) return;

  clearFocusHighlights();

  const style = currentSettings?.sentenceFocusStyle || 'dim';
  const cssObj = CSS as any;
  if (!cssObj.highlights) return;

  if (style === 'dim') {
    const root = document.body;
    const dimRanges: Range[] = [];

    try {
      const before = document.createRange();
      before.setStart(root, 0);
      
      // Optimize end of "before" range to avoid Chromium's Highlights API edge-rendering bug
      if (focused.startContainer.nodeType === Node.TEXT_NODE && focused.startOffset === 0) {
        before.setEndBefore(focused.startContainer);
      } else {
        before.setEnd(focused.startContainer, focused.startOffset);
      }
      
      if (before.toString().trim().length > 0) dimRanges.push(before);
    } catch { /* skip */ }

    try {
      const after = document.createRange();
      
      // Optimize start of "after" range to avoid Chromium's Highlights API edge-rendering bug
      if (focused.endContainer.nodeType === Node.TEXT_NODE && focused.endOffset === (focused.endContainer.textContent?.length ?? 0)) {
        after.setStartAfter(focused.endContainer);
      } else {
        after.setStart(focused.endContainer, focused.endOffset);
      }
      
      after.setEnd(root, root.childNodes.length);
      if (after.toString().trim().length > 0) dimRanges.push(after);
    } catch { /* skip */ }

    if (dimRanges.length > 0) {
      const highlight = new (window as any).Highlight(...dimRanges);
      cssObj.highlights.set('rttr-sentence-dim', highlight);
    }
  } else {
    // For other styles, highlight the focused range directly.
    // We use DOM element wrapping (<span>) to ensure 100% reliable rendering
    // across inline boundaries (like <a>, <code>, <sup>, etc.) where Highlight API has rendering bugs.
    try {
      console.log('[RTTR-DEBUG] applying focus highlight with style:', style, 'range:', focused.toString());
      const subRanges = splitRangeIntoTextRanges(focused);
      console.log('[RTTR-DEBUG] split range into', subRanges.length, 'sub-ranges');
      subRanges.forEach((sr, idx) => {
        console.log(`[RTTR-DEBUG] sub-range ${idx}: "${sr.toString()}"`, 
                    'start:', sr.startContainer.nodeName, sr.startOffset, 
                    'end:', sr.endContainer.nodeName, sr.endOffset,
                    'parent:', sr.startContainer.parentElement?.tagName,
                    'parentClass:', sr.startContainer.parentElement?.className,
                    'connected:', sr.startContainer.isConnected);
      });
      applyDOMHighlight(subRanges, style);
      console.log('[RTTR-DEBUG] successfully applied DOM highlights for style:', style);
    } catch (err) {
      console.error('[RTTR-DEBUG] Failed to apply DOM Highlights:', err);
    }
  }

  // Scroll focused sentence into view
  try {
    const focusedRect = focused.getBoundingClientRect();
    if (focusedRect.top < 0 || focusedRect.bottom > window.innerHeight) {
      const el = focused.startContainer.nodeType === Node.TEXT_NODE
        ? focused.startContainer.parentElement
        : focused.startContainer as HTMLElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch { /* skip */ }
}

// --- Internal: Utilities ---

/** Compute the character offset of the click position within `block`. 
 *  `offsetInNode` is the offset within the text node (e.g. from Range.startOffset). */
function getNodeOffsetInBlock(block: Element, node: Node, offsetInNode: number = 0): number {
  const textNodes = collectTextNodes(block, false);
  let cumOffset = 0;
  for (const tn of textNodes) {
    if (tn === node) {
      return cumOffset + offsetInNode;
    }
    if (tn.parentNode === node || node.contains(tn)) {
      return cumOffset + offsetInNode;
    }
    cumOffset += tn.textContent?.length || 0;
  }
  return 0;
}

function collectBlockText(block: Element): string {
  const nodes = collectTextNodes(block, false);
  return nodes.map(t => t.textContent || '').join('');
}

function collectTextNodes(block: Element, skipSeparators: boolean): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('script, style, rt, rp')) return NodeFilter.FILTER_REJECT;
      if (skipSeparators && parent.closest('.rttr-sentence-sep')) return NodeFilter.FILTER_REJECT;
      if (!skipSeparators && parent.closest('.rttr-sentence-sep, [data-rttr-split="true"] [data-rttr-split="true"]')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let nd: Node | null;
  while ((nd = walker.nextNode())) {
    if ((nd.textContent?.length || 0) > 0) textNodes.push(nd as Text);
  }
  return textNodes;
}

interface OffsetEntry {
  node: Text;
  cumStart: number;
  length: number;
}

function buildOffsetMap(textNodes: Text[]): OffsetEntry[] {
  const map: OffsetEntry[] = [];
  let cum = 0;
  for (const node of textNodes) {
    const len = node.textContent?.length || 0;
    map.push({ node, cumStart: cum, length: len });
    cum += len;
  }
  return map;
}

function findNodeAtOffset(offsetMap: OffsetEntry[], targetOffset: number): { nodeIdx: number; localOffset: number } | null {
  for (let i = 0; i < offsetMap.length; i++) {
    const entry = offsetMap[i];
    if (targetOffset >= entry.cumStart && targetOffset <= entry.cumStart + entry.length) {
      return { nodeIdx: i, localOffset: targetOffset - entry.cumStart };
    }
  }
  if (offsetMap.length > 0) {
    const last = offsetMap[offsetMap.length - 1];
    return { nodeIdx: offsetMap.length - 1, localOffset: last.length };
  }
  return null;
}

function getSeparatorIndex(sepEl: HTMLElement, block: Element): number {
  const seps = Array.from(block.querySelectorAll('.rttr-sentence-sep:not(.rttr-sentence-sep--hidden)'));
  return seps.indexOf(sepEl);
}

function findGlobalIndex(block: Element, localSentenceIdx: number, allRanges: Range[]): number {
  // Count sentences in blocks before this one
  const blocks = Array.from(splitBlocks).filter(b => document.contains(b));
  blocks.sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  let offset = 0;
  for (const b of blocks) {
    if (b === block) break;
    const data = sentenceStore.get(b);
    if (data) offset += data.boundaries.length;
  }

  const globalIdx = offset + localSentenceIdx;
  return globalIdx < allRanges.length ? globalIdx : -1;
}
