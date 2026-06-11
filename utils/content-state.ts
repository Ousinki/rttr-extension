import { reactive } from 'vue';

export interface MenuItem {
  icon?: string;
  label: string;
  type?: 'header' | 'divider' | 'item';
  onClick?: () => void;
  onSpeakClick?: () => void;
}

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

function toRect(rect: DOMRect | null, exactRect = false): Rect | null {
  if (!rect) return null;
  const rawRect = {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
  if (exactRect) return rawRect;
  return nearestLineRect(rawRect);
}

/**
 * Track the cursor Y at the moment of user interaction (mousedown/mouseenter).
 * Used by nearestLineRect as fallback.
 */
let _lastInteractionY = 0;
export function setLastInteractionY(y: number) { _lastInteractionY = y; }

/**
 * Get the correct per-line DOMRect for an inline element at the given cursor Y.
 * Uses getClientRects() which returns separate rects for each visual line.
 * This is the proper fix for cross-line elements like "Open Source\nCollective".
 */
export function getLineRect(el: HTMLElement, clientY: number): DOMRect {
  const rects = el.getClientRects();
  for (const r of rects) {
    if (clientY >= r.top && clientY <= r.bottom) {
      return r;
    }
  }
  // Fallback: pick the rect closest to cursorY
  let closest = el.getBoundingClientRect();
  let minDist = Infinity;
  for (const r of rects) {
    const centerY = r.top + r.height / 2;
    const dist = Math.abs(clientY - centerY);
    if (dist < minDist) {
      minDist = dist;
      closest = r;
    }
  }
  return closest;
}

/**
 * Rect-only fallback for Vue components that don't have access to the
 * original DOM element. Uses stored cursorY + heuristic line splitting.
 */
export function nearestLineRect(rect: Rect): Rect {
  // Use a generous threshold — ruby elements are taller than plain text
  const threshold = 50;
  if (rect.height <= threshold) return rect;

  const cursorY = _lastInteractionY;
  // Estimate line count from height
  const estimatedLineHeight = rect.height / Math.round(rect.height / 30);
  const lineCount = Math.round(rect.height / estimatedLineHeight);
  const lineHeight = rect.height / lineCount;

  let lineIndex = Math.floor((cursorY - rect.top) / lineHeight);
  lineIndex = Math.max(0, Math.min(lineIndex, lineCount - 1));

  const lineTop = rect.top + lineIndex * lineHeight;
  return {
    top: lineTop,
    left: rect.left,
    right: rect.right,
    bottom: lineTop + lineHeight,
    width: rect.width,
    height: lineHeight,
    scrollX: rect.scrollX,
    scrollY: rect.scrollY,
  };
}




export const uiState = reactive({
  tooltip: {
    visible: false,
    text: '',
    rect: null as Rect | null,
  },
  pronounceBadge: {
    visible: false,
    pinned: false,
    word: null as string | null,
    sylWord: null as string | null,
    content: '',
    isHTML: false,
    rect: null as Rect | null,
    translation: null as string | null,
    exactRect: false,
    updater: null as (() => DOMRect | null) | null,
  },
  overlaySyllable: {
    visible: false,
    lines: [] as { text: string; rect: Rect | null }[],
    fontSize: '16px',
    fontWeight: '400',
    fontFamily: 'inherit',
    color: '#000',
    letterSpacing: 'normal',
    fontStyle: 'normal',
  },
  translationBadge: {
    visible: false,
    pinned: false,
    text: '',
    engine: '',
    translationType: null as 'api' | 'ai' | null,
    isAnnotated: false,
    rect: null as Rect | null,
    position: 'bottom' as 'top' | 'bottom',
    showEngine: true,
    exactRect: false,
    updater: null as (() => DOMRect | null) | null,
    originalText: '',
  },
  explainPanel: {
    visible: false,
    loading: false,
    word: '',
    ipa: null as string | null,
    explanation: '',
    rect: null as Rect | null,
    isBottom: false,
    updater: null as (() => DOMRect | null) | null,
  },
  contextMenu: {
    visible: false,
    x: 0,
    y: 0,
    items: [] as MenuItem[],
  },
  longPressRing: {
    visible: false,
    pop: false,
    x: 0,
    y: 0,
  },
});

function toPlainRect(rect: DOMRect | null | any) {
  if (!rect) return null;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function syncAction(actionName: string, ...args: any[]) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('rttr-sync-ui', {
      detail: { action: actionName, args }
    });
    window.dispatchEvent(event);
  }
}

export const uiActions = {
  // Tooltip
  showTooltip(text: string, rect: DOMRect) {
    uiState.tooltip.text = text;
    uiState.tooltip.rect = toRect(rect);
    uiState.tooltip.visible = true;
  },
  hideTooltip() {
    uiState.tooltip.visible = false;
  },

  // Pronounce Badge
  showPronounceBadge(content: string, rect: DOMRect, isHTML = false, word: string | null = null, sylWord: string | null = null, translation: string | null = null, exactRect = false, updater: (() => DOMRect | null) | null = null, isSync = false) {
    const b = uiState.pronounceBadge;
    const newRect = toRect(rect, exactRect);

    // Skip redundant updates on repeated clicks of the same word so Vue
    // doesn't re-run style/transition effects and cause a flicker.
    if (
      b.visible &&
      b.word === word &&
      b.sylWord === sylWord &&
      b.content === content &&
      b.isHTML === isHTML &&
      newRect &&
      b.rect &&
      b.rect.top === newRect.top &&
      b.rect.left === newRect.left &&
      b.rect.width === newRect.width &&
      b.rect.height === newRect.height
    ) {
      return;
    }
    b.word = word;
    b.sylWord = sylWord;
    b.content = content;
    b.isHTML = isHTML;
    b.rect = newRect;
    b.exactRect = exactRect;
    b.updater = updater;
    if (translation !== null) b.translation = translation;
    b.visible = true;

    if (!isSync) {
      syncAction('showPronounceBadge', content, toPlainRect(rect), isHTML, word, sylWord, translation, exactRect, null);
    }
  },
  updatePronounceBadgeTranslation(translation: string, isSync = false) {
    if (uiState.pronounceBadge.visible) {
      uiState.pronounceBadge.translation = translation;
    }
    if (!isSync) {
      syncAction('updatePronounceBadgeTranslation', translation);
    }
  },
  hidePronounceBadge(isSync = false) {
    uiState.pronounceBadge.visible = false;
    uiState.pronounceBadge.pinned = false;
    uiState.pronounceBadge.word = null;
    uiState.pronounceBadge.sylWord = null;
    uiState.pronounceBadge.translation = null;
    if (!isSync) {
      syncAction('hidePronounceBadge');
    }
  },
  // Overlay Syllable
  showOverlaySyllable(
    lines: { text: string; rect: DOMRect }[], 
    fontSize: string, 
    fontWeight: string, 
    fontFamily: string,
    color: string,
    letterSpacing: string,
    fontStyle: string,
    isSync = false
  ) {
    uiState.overlaySyllable.lines = lines.map(line => ({ text: line.text, rect: toRect(line.rect) }));
    uiState.overlaySyllable.fontSize = fontSize;
    uiState.overlaySyllable.fontWeight = fontWeight;
    uiState.overlaySyllable.fontFamily = fontFamily;
    uiState.overlaySyllable.color = color;
    uiState.overlaySyllable.letterSpacing = letterSpacing;
    uiState.overlaySyllable.fontStyle = fontStyle;
    uiState.overlaySyllable.visible = true;

    if (!isSync) {
      const plainLines = lines.map(l => ({ text: l.text, rect: toPlainRect(l.rect) }));
      syncAction('showOverlaySyllable', plainLines, fontSize, fontWeight, fontFamily, color, letterSpacing, fontStyle);
    }
  },
  hideOverlaySyllable(isSync = false) {
    uiState.overlaySyllable.visible = false;
    if (!isSync) {
      syncAction('hideOverlaySyllable');
    }
  },

  // Translation Badge
  showTranslationBadge(text: string, engine: string, targetRect: DOMRect, isAnnotated: boolean, position: 'top' | 'bottom' = 'bottom', showEngine = true, exactRect = false, updater: (() => DOMRect | null) | null = null, originalText = '', isSync = false) {
    uiState.translationBadge.text = text;
    uiState.translationBadge.engine = engine;
    uiState.translationBadge.translationType = engine === 'AI' ? 'ai' : 'api';
    uiState.translationBadge.rect = toRect(targetRect, exactRect);
    uiState.translationBadge.exactRect = exactRect;
    uiState.translationBadge.updater = updater;
    uiState.translationBadge.isAnnotated = isAnnotated;
    uiState.translationBadge.position = position;
    uiState.translationBadge.showEngine = showEngine;
    uiState.translationBadge.originalText = originalText;
    uiState.translationBadge.visible = true;

    if (!isSync) {
      syncAction('showTranslationBadge', text, engine, toPlainRect(targetRect), isAnnotated, position, showEngine, exactRect, null, originalText);
    }
  },
  hideTranslationBadge(isSync = false) {
    uiState.translationBadge.visible = false;
    uiState.translationBadge.pinned = false;
    if (!isSync) {
      syncAction('hideTranslationBadge');
    }
  },

  // Explain Panel
  showExplainPanelLoading(word: string, rect: DOMRect, isSync = false) {
    uiState.explainPanel.word = word;
    uiState.explainPanel.rect = toRect(rect);
    uiState.explainPanel.loading = true;
    uiState.explainPanel.visible = true;

    if (!isSync) {
      syncAction('showExplainPanelLoading', word, toPlainRect(rect));
    }
  },
  showExplainPanel(word: string, ipa: string | null, explanation: string, rect: DOMRect, isBottom = false, updater: (() => DOMRect | null) | null = null, isSync = false) {
    uiState.explainPanel.word = word;
    uiState.explainPanel.ipa = ipa;
    uiState.explainPanel.explanation = explanation;
    uiState.explainPanel.rect = toRect(rect);
    uiState.explainPanel.isBottom = isBottom;
    uiState.explainPanel.updater = updater;
    uiState.explainPanel.loading = false;
    uiState.explainPanel.visible = true;

    if (!isSync) {
      syncAction('showExplainPanel', word, ipa, explanation, toPlainRect(rect), isBottom, null);
    }
  },
  hideExplainPanel(isSync = false) {
    uiState.explainPanel.visible = false;
    if (!isSync) {
      syncAction('hideExplainPanel');
    }
  },

  // Context Menu
  showContextMenu(items: MenuItem[], x: number, y: number) {
    uiState.contextMenu.items = items;
    uiState.contextMenu.x = x;
    uiState.contextMenu.y = y;
    uiState.contextMenu.visible = true;
  },
  updateContextMenuItem(index: number, item: Partial<MenuItem>) {
    const current = uiState.contextMenu.items[index];
    if (!current) return;
    uiState.contextMenu.items[index] = { ...current, ...item };
  },
  hideContextMenu() {
    uiState.contextMenu.visible = false;
  },

  // Long Press Ring
  showLongPressRing(x: number, y: number) {
    uiState.longPressRing.x = x;
    uiState.longPressRing.y = y;
    uiState.longPressRing.pop = false;
    uiState.longPressRing.visible = true;
  },
  popLongPressRing() {
    uiState.longPressRing.pop = true;
    setTimeout(() => {
      uiState.longPressRing.visible = false;
      uiState.longPressRing.pop = false;
    }, 250);
  },
  hideLongPressRing() {
    uiState.longPressRing.visible = false;
    uiState.longPressRing.pop = false;
  },
  
  updateActiveRects() {
    if (uiState.translationBadge.visible && uiState.translationBadge.updater) {
      const newRect = uiState.translationBadge.updater();
      if (newRect) uiState.translationBadge.rect = toRect(newRect, uiState.translationBadge.exactRect);
    }
    if (uiState.pronounceBadge.visible && uiState.pronounceBadge.updater) {
      const newRect = uiState.pronounceBadge.updater();
      if (newRect) uiState.pronounceBadge.rect = toRect(newRect, uiState.pronounceBadge.exactRect);
    }
    if (uiState.explainPanel.visible && uiState.explainPanel.updater) {
      const newRect = uiState.explainPanel.updater();
      if (newRect) uiState.explainPanel.rect = toRect(newRect, false);
    }
  }
};

// Global cross-context sync listener
if (typeof window !== 'undefined') {
  window.addEventListener('rttr-sync-ui', (e: Event) => {
    const customEvent = e as CustomEvent<{ action: string; args: any[] }>;
    const { action, args } = customEvent.detail;
    const method = (uiActions as any)[action];
    if (typeof method === 'function') {
      try {
        method(...args, true);
      } catch (err) {
        console.error('[RTTR-DEBUG] Sync action execution failed:', action, err);
      }
    }
  });
}

