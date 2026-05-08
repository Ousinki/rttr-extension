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
}

function toRect(rect: DOMRect | null): Rect | null {
  if (!rect) return null;
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
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
    content: '',
    isHTML: false,
    rect: null as Rect | null,
  },
  translationBadge: {
    visible: false,
    text: '',
    engine: '',
    isAnnotated: false,
    rect: null as Rect | null,
    position: 'bottom' as 'top' | 'bottom',
    showEngine: true,
  },
  explainPanel: {
    visible: false,
    loading: false,
    word: '',
    ipa: null as string | null,
    explanation: '',
    rect: null as Rect | null,
    isBottom: false,
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
  showPronounceBadge(content: string, rect: DOMRect, isHTML = false) {
    uiState.pronounceBadge.content = content;
    uiState.pronounceBadge.isHTML = isHTML;
    uiState.pronounceBadge.rect = toRect(rect);
    uiState.pronounceBadge.visible = true;
  },
  hidePronounceBadge() {
    uiState.pronounceBadge.visible = false;
  },

  // Translation Badge
  showTranslationBadge(text: string, engine: string, targetRect: DOMRect, isAnnotated: boolean, position: 'top' | 'bottom' = 'bottom', showEngine = true) {
    uiState.translationBadge.text = text;
    uiState.translationBadge.engine = engine;
    uiState.translationBadge.rect = toRect(targetRect);
    uiState.translationBadge.isAnnotated = isAnnotated;
    uiState.translationBadge.position = position;
    uiState.translationBadge.showEngine = showEngine;
    uiState.translationBadge.visible = true;
  },
  hideTranslationBadge() {
    uiState.translationBadge.visible = false;
  },

  // Explain Panel
  showExplainPanelLoading(word: string, rect: DOMRect) {
    uiState.explainPanel.word = word;
    uiState.explainPanel.rect = toRect(rect);
    uiState.explainPanel.loading = true;
    uiState.explainPanel.visible = true;
  },
  showExplainPanel(word: string, ipa: string | null, explanation: string, rect: DOMRect, isBottom = false) {
    uiState.explainPanel.word = word;
    uiState.explainPanel.ipa = ipa;
    uiState.explainPanel.explanation = explanation;
    uiState.explainPanel.rect = toRect(rect);
    uiState.explainPanel.isBottom = isBottom;
    uiState.explainPanel.loading = false;
    uiState.explainPanel.visible = true;
  },
  hideExplainPanel() {
    uiState.explainPanel.visible = false;
  },

  // Context Menu
  showContextMenu(items: MenuItem[], x: number, y: number) {
    uiState.contextMenu.items = items;
    uiState.contextMenu.x = x;
    uiState.contextMenu.y = y;
    uiState.contextMenu.visible = true;
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
};
