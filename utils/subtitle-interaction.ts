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
import { getDeepCaretRangeFromPoint } from '@/utils/content-dom';
import { biliState } from '@/utils/bilibili-state';

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

    /* 字幕容器链一律不响应鼠标事件，允许完全穿透，避免干扰底层视频点击播放/暂停 */
    ${SUBTITLE_CONTAINER_SELECTORS.split(', ').join(',\n    ')} {
      pointer-events: none !important;
    }

    /* 只有字幕文本节点本身及子孙节点才响应鼠标事件，并允许选词与 I 型文本光标 */
    ${SUBTITLE_TEXT_SELECTORS.split(', ').join(',\n    ')},
    ${SUBTITLE_TEXT_SELECTORS.split(', ').map(s => s + ' *').join(',\n    ')} {
      pointer-events: auto !important;
      cursor: text !important;
      user-select: text !important;
      -webkit-user-select: text !important;
    }

    /* 针对 YouTube 和沉浸式翻译特殊的高优先级覆盖，防止其他样式重置 pointer-events */
    #ytp-caption-window-container .ytp-caption-segment,
    .ytp-caption-window-container .ytp-caption-segment,
    .caption-window .ytp-caption-segment,
    .imt-caption-window .source-cue,
    .imt-caption-window .imt-cue,
    .imt-caption-window .target-cue,
    #ytp-caption-window-container .ytp-caption-segment *,
    .imt-caption-window .source-cue *,
    .imt-caption-window .imt-cue *,
    .imt-caption-window .target-cue * {
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
    .rttr-subtitle-word-highlight {
      color: #00aeec !important;
      text-shadow: 0 0 8px rgba(0, 174, 236, 0.4) !important;
      transition: color 0.2s ease, text-shadow 0.2s ease !important;
      border-radius: 2px;
      pointer-events: auto !important;
    }
    .rttr-subtitle-word-highlight.fading {
      color: inherit !important;
      text-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

/** 针对 Shadow DOM 动态注入高亮样式与 pointer-events 启用样式 */
function injectStylesIntoShadowRoot(root: ShadowRoot) {
  if (root.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Enable mouse pointer events on subtitle elements inside shadow root */
    ${SUBTITLE_TEXT_SELECTORS.split(', ').join(',\n    ')},
    ${SUBTITLE_TEXT_SELECTORS.split(', ').map(s => s + ' *').join(',\n    ')} {
      pointer-events: auto !important;
      cursor: text !important;
      user-select: text !important;
      -webkit-user-select: text !important;
    }
    
    /* Word highlight inside Shadow DOM */
    .rttr-subtitle-word-highlight {
      color: #00aeec !important;
      text-shadow: 0 0 8px rgba(0, 174, 236, 0.4) !important;
      transition: color 0.2s ease, text-shadow 0.2s ease !important;
      border-radius: 2px;
      pointer-events: auto !important;
    }
    .rttr-subtitle-word-highlight.fading {
      color: inherit !important;
      text-shadow: none !important;
    }
  `;
  root.appendChild(style);
}

/** 动态监听并为所有 Shadow DOM 注入高亮样式与 pointer-events 启用样式 */
function observeAndStyleShadowRoots() {
  const styledShadowRoots = new WeakSet<ShadowRoot>();

  const scan = (node: Node) => {
    if (node instanceof Element) {
      if (node.shadowRoot) {
        if (!styledShadowRoots.has(node.shadowRoot)) {
          styledShadowRoots.add(node.shadowRoot);
          injectStylesIntoShadowRoot(node.shadowRoot);
        }
        scan(node.shadowRoot);
      }
      let child = node.firstElementChild;
      while (child) {
        scan(child);
        child = child.nextElementSibling;
      }
    } else if (node instanceof Document || node instanceof ShadowRoot) {
      let child = node.firstElementChild;
      while (child) {
        scan(child);
        child = child.nextElementSibling;
      }
    }
  };

  // Run initial scan
  scan(document);

  // Monitor document mutations to pierce newly created shadow roots
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        if (addedNode instanceof Element) {
          scan(addedNode);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Lightweight interval as a bulletproof backup
  const intervalId = setInterval(() => {
    scan(document);
  }, 1000);

  return {
    destroy() {
      observer.disconnect();
      clearInterval(intervalId);
    }
  };
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

/** 从事件目标及事件路径向上查找字幕文本元素 (支持 Shadow DOM) */
function findSubtitleElement(target: EventTarget | null, e?: Event): Element | null {
  if (e && typeof e.composedPath === 'function') {
    const path = e.composedPath();
    for (const node of path) {
      if (node instanceof Element) {
        if (node.matches(SUBTITLE_TEXT_SELECTORS)) {
          return node;
        }
      }
    }
  }

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

  // 动态扫描并为所有 Shadow DOM 注入 pointer-events 开启及高亮样式
  const shadowObserver = observeAndStyleShadowRoots();

  let currentMode: 'off' | 'hover' | 'click' = 'hover';
  let currentHoverSubtitle: Element | null = null;
  let hoverDebounce: any = null;
  let hoverPausedByUs = false;

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

  // --- HMR 幽灵监听器击杀机制 ---
  // 开发环境下热更新(HMR)会导致多次注册相同的 document.addEventListener('mouseover', ...)
  // 旧的监听器无法被自动移除，会变成“幽灵监听器”继续触发暂停！
  // 通过赋予当前实例唯一的 ID，所有旧实例一旦发现 ID 不匹配就会立刻自杀退出。
  const INSTANCE_ID = Date.now() + Math.random();
  (window as any).__rttr_subtitle_active_instance = INSTANCE_ID;

  const isGhostListener = () => {
    return (window as any).__rttr_subtitle_active_instance !== INSTANCE_ID;
  };

  // ─── 事件委托处理 ───

  const checkStudyActive = (): boolean => {
    const isBilibili = window.location.hostname.includes('bilibili.com');
    const studyBtn = document.getElementById('rttr-bili-study-trigger');
    
    if (isBilibili) {
      // 在 B 站：直接检查 DOM，这是穿越一切上下文隔离的最终真理
      // 只要按钮不存在，或者按钮变灰了（没有 active），立刻放行，绝不暂停视频
      if (!studyBtn || !studyBtn.classList.contains('active')) {
        return false;
      }
    } else {
      // 对于 YouTube 等目前尚未注入该开关按钮的平台，如果找不到按钮，默认放行
      const studyBtn = document.getElementById('rttr-bili-study-trigger');
      if (studyBtn && !studyBtn.classList.contains('active')) {
        return false;
      }
    }
    
    return true;
  };

  /**
   * mouseover (冒泡版 mouseenter)：鼠标移入字幕文本时
   */
  const onMouseOver = (e: MouseEvent) => {
    if (isGhostListener()) return; // 遇到幽灵监听器，直接自杀
    if (currentMode === 'off') return;
    if (!checkStudyActive()) return;
    const subtitleEl = findSubtitleElement(e.target, e);
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
    if (isGhostListener()) return;
    const subtitleEl = findSubtitleElement(e.target, e);
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
    if (isGhostListener()) return;
    if (currentMode === 'off') return;
    if (!checkStudyActive()) return;
    const subtitleEl = findSubtitleElement(e.target, e);
    if (!subtitleEl) return;

    // 阻止事件继续向下传递或向上冒泡给底层视频播放器（防止 YouTube 触发播放/暂停）
    e.stopPropagation();

    // 清除之前的高亮
    subtitleEl.querySelectorAll('.rttr-subtitle-word-highlight').forEach(span => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent || ''), span);
        parent.normalize();
      }
    });

    // 使用 caretRangeFromPoint 精准定位到点击位置的文本
    const range = getDeepCaretRangeFromPoint(e.clientX, e.clientY);
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
      const root = subtitleEl.getRootNode();
      if (root instanceof ShadowRoot) {
        injectStylesIntoShadowRoot(root);
      }

      const wordRange = document.createRange();
      wordRange.setStart(textNode, start);
      wordRange.setEnd(textNode, end);

      const highlightSpan = document.createElement('span');
      highlightSpan.className = 'rttr-subtitle-word-highlight';
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

  // ─── 拦截并阻止底层视频播放器捕获字幕区域的鼠标/指针事件（防止 drag/play/pause 等干扰行为） ───
  const handleSubtitleEvents = (e: Event) => {
    if (currentMode === 'off') return;
    if (!checkStudyActive()) return;
    const subtitleEl = findSubtitleElement(e.target, e);
    if (!subtitleEl) return;

    e.stopPropagation();
  };

  // ─── 注册事件委托（在 document 级别监听，冒泡捕获） ───

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mousedown', handleSubtitleEvents, true);
  document.addEventListener('mouseup', handleSubtitleEvents, true);
  document.addEventListener('pointerdown', handleSubtitleEvents, true);
  document.addEventListener('pointerup', handleSubtitleEvents, true);

  // ─── 返回清理函数 ───

  return {
    destroy() {
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseout', onMouseOut, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousedown', handleSubtitleEvents, true);
      document.removeEventListener('mouseup', handleSubtitleEvents, true);
      document.removeEventListener('pointerdown', handleSubtitleEvents, true);
      document.removeEventListener('pointerup', handleSubtitleEvents, true);
      if (hoverDebounce) clearTimeout(hoverDebounce);
      unwatchSettings();
      shadowObserver.destroy();
      const styleEl = document.getElementById(STYLE_ID);
      if (styleEl) styleEl.remove();
    }
  };
}
