/**
 * Universal Subtitle Interaction Module
 * 
 * 跨平台视频字幕交互增强：
 * - 悬停字幕自动暂停 / 点击字幕暂停（可选模式）
 * - 点击单词高亮（蓝色品牌色 + mouseleave 淡出）
 * - I 型文本光标覆盖
 * - 支持：Bilibili、YouTube 及其他视频平台
 */

import { settingsStorage } from '@/utils/storage';

// ─── 多平台字幕元素选择器 ───────────────────────────────────

/** 字幕文本元素的选择器（直接包含字幕文字的 span/div） */
const SUBTITLE_TEXT_SELECTORS = [
  // Bilibili
  '.bili-subtitle-x-subtitle-panel-text',
  '.bilibili-player-video-subtitle-text',
  '.bpx-player-subtitle-panel-text',
  // YouTube (原生)
  '.ytp-caption-segment',
  '.caption-visual-line',
  '.captions-text span',
  // YouTube (沉浸式翻译等插件)
  '.source-cue',
  '.imt-cue',
  '.target-cue',
  // 通用视频播放器
  '[role="caption"]',
].join(', ');

/** 字幕容器元素的选择器（用于保留 move 光标 + 启用 pointer-events） */
const SUBTITLE_CONTAINER_SELECTORS = [
  // Bilibili
  '.bili-subtitle-x-subtitle-panel',
  '.bilibili-player-video-subtitle',
  '.bpx-player-subtitle-panel',
  // YouTube (整条字幕容器链)
  '.ytp-caption-window-container',
  '.caption-window',
  '.ytp-caption-window-bottom',
  '.ytp-caption-window-top',
  '.captions-text',
].join(', ');

// ─── CSS 样式注入 ───────────────────────────────────────────

const STYLE_ID = 'rttr-subtitle-interaction-styles';

function injectSubtitleStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ─── RTTR 通用字幕交互样式 ─── */

    /* 字幕容器链：启用鼠标事件（YouTube 默认 pointer-events: none） */
    ${SUBTITLE_CONTAINER_SELECTORS.split(', ').join(',\n    ')} {
      pointer-events: auto !important;
      cursor: move;
    }

    /* 字幕文本区：I 型光标，允许选词，启用鼠标事件 */
    ${SUBTITLE_TEXT_SELECTORS.split(', ').join(',\n    ')} {
      cursor: text !important;
      user-select: text !important;
      -webkit-user-select: text !important;
      pointer-events: auto !important;
    }

    /* 选中文本高亮色 */
    ${SUBTITLE_TEXT_SELECTORS.split(', ').map(s => s + '::selection').join(',\n    ')} {
      background: rgba(0, 174, 236, 0.35) !important;
      color: #fff !important;
    }

    /* 被 RTTR 点击查词高亮的单词 */
    .rttr-word-highlight {
      color: #00aeec !important;
      text-shadow: 0 0 8px rgba(0, 174, 236, 0.4) !important;
      transition: color 0.2s ease, text-shadow 0.2s ease !important;
      border-radius: 2px;
    }
    .rttr-word-highlight.fading {
      color: inherit !important;
      text-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

// ─── 交互逻辑 ───────────────────────────────────────────────

/** 查找最近的 <video> 元素 */
function findNearestVideo(el: Element): HTMLVideoElement | null {
  // 1. 尝试在同一个播放器容器内找 video
  const playerContainers = [
    '.bpx-player-video-wrap',    // Bilibili
    '.bilibili-player-video',    // Bilibili (旧版)
    '#movie_player',             // YouTube
    '.html5-video-player',       // YouTube
    '.video-player',             // 通用
    'video',                     // 直接找
  ];

  for (const selector of playerContainers) {
    const container = el.closest(selector);
    if (container) {
      const video = container.querySelector('video, bwp-video') as HTMLVideoElement;
      if (video) return video;
    }
  }

  // 2. 回退：直接找页面上第一个 video
  return document.querySelector('video, bwp-video') as HTMLVideoElement;
}

/** 判断元素是否是字幕文本元素 */
function isSubtitleElement(el: Element): boolean {
  return el.matches(SUBTITLE_TEXT_SELECTORS);
}

export interface SubtitleInteractionCleanup {
  destroy: () => void;
}

/**
 * 初始化通用字幕交互模块
 * @returns 清理函数对象
 */
export function initSubtitleInteraction(): SubtitleInteractionCleanup {
  // 注入 CSS
  injectSubtitleStyles();

  let currentMode: 'off' | 'hover' | 'click' = 'hover';
  let hoverPausedByUs = false;
  let hoverDebounce: ReturnType<typeof setTimeout> | null = null;
  const boundElements = new WeakSet<Element>();

  // 从设置中读取初始模式
  settingsStorage.getValue().then(s => {
    currentMode = s.biliSubtitleHoverPause || 'hover';
  });

  // 监听设置变化
  const unwatchSettings = settingsStorage.watch((newSettings) => {
    if (newSettings) {
      currentMode = newSettings.biliSubtitleHoverPause || 'hover';
    }
  });

  // ─── 事件处理 ───

  const handleMouseEnter = (e: Event) => {
    if (currentMode !== 'hover') return;
    const el = e.currentTarget as Element;
    hoverDebounce = setTimeout(() => {
      const video = findNearestVideo(el);
      if (video && !video.paused) {
        video.pause();
        hoverPausedByUs = true;
      }
    }, 120);
  };

  const handleMouseLeave = () => {
    if (hoverDebounce) {
      clearTimeout(hoverDebounce);
      hoverDebounce = null;
    }
    if (hoverPausedByUs) {
      // 找到页面上的 video 恢复播放
      const video = document.querySelector('video, bwp-video') as HTMLVideoElement;
      if (video && video.paused) {
        video.play();
      }
      hoverPausedByUs = false;
    }
  };

  const handleClick = (e: Event) => {
    if (currentMode === 'off') return;
    const el = e.currentTarget as Element;
    const mouseEvent = e as MouseEvent;

    // 清除之前的高亮
    el.querySelectorAll('.rttr-word-highlight').forEach(span => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent || ''), span);
        parent.normalize();
      }
    });

    // 使用 caretRangeFromPoint 精准定位到点击位置的文本
    const range = document.caretRangeFromPoint?.(mouseEvent.clientX, mouseEvent.clientY);
    if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return;

    const textNode = range.startContainer as Text;
    const text = textNode.textContent || '';
    const offset = range.startOffset;

    // 向前向后扫描，提取完整英文单词边界
    let start = offset;
    let end = offset;
    const wordCharRegex = /[a-zA-Z'-]/;
    while (start > 0 && wordCharRegex.test(text[start - 1])) start--;
    while (end < text.length && wordCharRegex.test(text[end])) end++;

    const word = text.slice(start, end).trim();
    if (!word || word.length < 2) return;

    // 「点击暂停」模式：点击单词时才暂停视频
    if (currentMode === 'click' && !hoverPausedByUs) {
      const video = findNearestVideo(el);
      if (video && !video.paused) {
        video.pause();
        hoverPausedByUs = true;
      }
    }

    // 用带颜色的 span 包裹目标单词
    try {
      const wordRange = document.createRange();
      wordRange.setStart(textNode, start);
      wordRange.setEnd(textNode, end);

      const highlightSpan = document.createElement('span');
      highlightSpan.className = 'rttr-word-highlight';
      wordRange.surroundContents(highlightSpan);

      // 鼠标离开该单词时淡出并移除高亮
      highlightSpan.addEventListener('mouseleave', () => {
        highlightSpan.classList.add('fading');
        setTimeout(() => {
          const parent = highlightSpan.parentNode;
          if (parent) {
            parent.replaceChild(document.createTextNode(highlightSpan.textContent || ''), highlightSpan);
            parent.normalize();
          }
        }, 300);
      });
    } catch {
      // surroundContents 在跨节点时可能失败，静默忽略
    }
  };

  // ─── 元素绑定 ───

  const bindElement = (el: Element) => {
    if (boundElements.has(el)) return;
    boundElements.add(el);
    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);
    el.addEventListener('click', handleClick);
  };

  // 扫描已存在的字幕元素
  const scanAndBind = () => {
    document.querySelectorAll(SUBTITLE_TEXT_SELECTORS).forEach(bindElement);
  };

  // MutationObserver 监听动态插入的字幕元素
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (isSubtitleElement(node)) {
          bindElement(node);
        }
        const children = node.querySelectorAll(SUBTITLE_TEXT_SELECTORS);
        children.forEach(bindElement);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scanAndBind();

  // ─── 返回清理函数 ───

  return {
    destroy() {
      observer.disconnect();
      if (hoverDebounce) clearTimeout(hoverDebounce);
      unwatchSettings();
      const styleEl = document.getElementById(STYLE_ID);
      if (styleEl) styleEl.remove();
    }
  };
}
