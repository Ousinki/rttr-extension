/**
 * Universal Subtitle Interaction Module
 * 
 * 跨平台视频字幕交互增强：
 * - 悬停字幕自动暂停 / 点击字幕暂停（可选模式）
 * - 点击单词高亮（蓝色品牌色 + mouseleave 淡出）
 * - I 型文本光标覆盖
 * - 支持：Bilibili、YouTube 及其他视频平台
 * 
 * 使用事件委托（event delegation）而非逐元素绑定，
 * 确保即使字幕元素被频繁创建/销毁也能可靠工作。
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
  '#ytp-caption-window-container',
  '.ytp-caption-window-container',
  '.caption-window',
  '.ytp-caption-window-bottom',
  '.ytp-caption-window-top',
  '.captions-text',
  // Immersive Translate (沉浸式翻译容器)
  '.imt-caption-window',
  '.imt-caption-window-container',
  '.imt-captions-text',
].join(', ');

// ─── CSS 样式注入 ───────────────────────────────────────────

const STYLE_ID = 'rttr-subtitle-interaction-styles';

function injectSubtitleStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ─── RTTR 通用字幕交互样式 ─── */

    /* 字幕容器链：必须允许 pointer-events (空背景允许穿透，只响应字体的 pointer-events) */
    ${SUBTITLE_CONTAINER_SELECTORS.split(', ').join(',\n    ')} {
      pointer-events: none !important;
    }

    /* 显式为具体容器下的所有子孙元素开启 pointer-events */
    #ytp-caption-window-container *,
    .ytp-caption-window-container *,
    .caption-window *,
    .imt-caption-window * {
      pointer-events: auto !important;
    }

    /* 字幕文本区：I 型光标，允许选词，启用鼠标事件 */
    ${SUBTITLE_TEXT_SELECTORS.split(', ').join(',\n    ')} {
      cursor: text !important;
      user-select: text !important;
      -webkit-user-select: text !important;
      pointer-events: auto !important;
    }

    /* 针对 YouTube 和沉浸式翻译特殊的高优先级覆盖，防止其他样式重置 pointer-events */
    #ytp-caption-window-container .ytp-caption-segment,
    .ytp-caption-window-container .ytp-caption-segment,
    .caption-window .ytp-caption-segment,
    .imt-caption-window .source-cue,
    .imt-caption-window .imt-cue,
    .imt-caption-window .target-cue {
      pointer-events: auto !important;
      cursor: text !important;
      user-select: text !important;
      -webkit-user-select: text !important;
    }

    /* 选中文本高亮色 */
    ${SUBTITLE_TEXT_SELECTORS.split(', ').map(s => s + '::selection').join(',\n    ')},
    #ytp-caption-window-container .ytp-caption-segment::selection,
    .imt-caption-window .source-cue::selection,
    .imt-caption-window .imt-cue::selection {
      background: rgba(0, 174, 236, 0.35) !important;
      color: #fff !important;
    }

    /* 被 RTTR 点击查词高亮的单词 */
    .rttr-word-highlight {
      color: #00aeec !important;
      text-shadow: 0 0 8px rgba(0, 174, 236, 0.4) !important;
      transition: color 0.2s ease, text-shadow 0.2s ease !important;
      border-radius: 2px;
      pointer-events: auto !important;
    }
    .rttr-word-highlight.fading {
      color: inherit !important;
      text-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

// ─── 工具函数 ───────────────────────────────────────────────

/** 查找最近的 <video> 元素 */
function findNearestVideo(el: Element): HTMLVideoElement | null {
  const playerContainers = [
    '.bpx-player-video-wrap',    // Bilibili
    '.bilibili-player-video',    // Bilibili (旧版)
    '#movie_player',             // YouTube
    '.html5-video-player',       // YouTube
    '.video-player',             // 通用
  ];

  for (const selector of playerContainers) {
    const container = el.closest(selector);
    if (container) {
      const video = container.querySelector('video, bwp-video') as HTMLVideoElement;
      if (video) return video;
    }
  }

  // 回退：页面上第一个 video
  return document.querySelector('video, bwp-video') as HTMLVideoElement;
}

/** 从事件目标向上查找字幕文本元素 */
function findSubtitleElement(target: EventTarget | null): Element | null {
  if (!target || !(target instanceof Element)) return null;
  return target.closest(SUBTITLE_TEXT_SELECTORS);
}

// ─── 导出接口 ───────────────────────────────────────────────

export interface SubtitleInteractionCleanup {
  destroy: () => void;
}

/**
 * 初始化通用字幕交互模块（基于事件委托）
 * @returns 清理函数对象
 */
export function initSubtitleInteraction(): SubtitleInteractionCleanup {
  // 注入 CSS
  injectSubtitleStyles();

  let currentMode: 'off' | 'hover' | 'click' = 'hover';
  let hoverPausedByUs = false;
  let hoverDebounce: ReturnType<typeof setTimeout> | null = null;
  let currentHoverSubtitle: Element | null = null;

  // 从设置中读取初始模式（兼容旧版 boolean 值）
  settingsStorage.getValue().then(s => {
    const val = s.biliSubtitleHoverPause as any;
    if (val === true || val === 'hover') currentMode = 'hover';
    else if (val === 'click') currentMode = 'click';
    else if (val === false || val === 'off') currentMode = 'off';
    else currentMode = 'hover';
  });

  // 监听设置变化
  const unwatchSettings = settingsStorage.watch((newSettings) => {
    if (!newSettings) return;
    const val = newSettings.biliSubtitleHoverPause as any;
    if (val === true || val === 'hover') currentMode = 'hover';
    else if (val === 'click') currentMode = 'click';
    else currentMode = 'off';
  });

  // ─── 事件委托处理 ───

  /**
   * mouseover (冒泡版 mouseenter)：鼠标移入字幕文本时
   */
  const onMouseOver = (e: MouseEvent) => {
    if (currentMode === 'off') return;
    const subtitleEl = findSubtitleElement(e.target);
    if (!subtitleEl) return;

    // 避免在同一个字幕元素内重复触发
    if (subtitleEl === currentHoverSubtitle) return;
    currentHoverSubtitle = subtitleEl;

    if (currentMode !== 'hover') return;

    // 防抖：避免鼠标快速划过误触
    if (hoverDebounce) clearTimeout(hoverDebounce);
    hoverDebounce = setTimeout(() => {
      const video = findNearestVideo(subtitleEl);
      if (video && !video.paused) {
        video.pause();
        hoverPausedByUs = true;
      }
    }, 120);
  };

  /**
   * mouseout (冒泡版 mouseleave)：鼠标离开字幕文本时
   */
  const onMouseOut = (e: MouseEvent) => {
    const subtitleEl = findSubtitleElement(e.target);
    if (!subtitleEl) return;

    // 检查是否真的离开了字幕区域（而不是移到子元素）
    const relatedTarget = e.relatedTarget as Element | null;
    if (relatedTarget && subtitleEl.contains(relatedTarget)) return;

    currentHoverSubtitle = null;

    // 取消防抖计时器
    if (hoverDebounce) {
      clearTimeout(hoverDebounce);
      hoverDebounce = null;
    }

    // 仅当是我们触发的暂停时才恢复播放
    if (hoverPausedByUs) {
      const video = findNearestVideo(subtitleEl);
      if (video && video.paused) {
        video.play();
      }
      hoverPausedByUs = false;
    }
  };

  /**
   * click：点击字幕单词 → 高亮 + (click 模式下)暂停
   */
  const onClick = (e: MouseEvent) => {
    if (currentMode === 'off') return;
    const subtitleEl = findSubtitleElement(e.target);
    if (!subtitleEl) return;

    // 清除之前的高亮
    subtitleEl.querySelectorAll('.rttr-word-highlight').forEach(span => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent || ''), span);
        parent.normalize();
      }
    });

    // 使用 caretRangeFromPoint 精准定位到点击位置的文本
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
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
      const video = findNearestVideo(subtitleEl);
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

  // ─── 注册事件委托（在 document 级别监听，冒泡捕获） ───

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);

  // ─── 返回清理函数 ───

  return {
    destroy() {
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseout', onMouseOut, true);
      document.removeEventListener('click', onClick, true);
      if (hoverDebounce) clearTimeout(hoverDebounce);
      unwatchSettings();
      const styleEl = document.getElementById(STYLE_ID);
      if (styleEl) styleEl.remove();
    }
  };
}
