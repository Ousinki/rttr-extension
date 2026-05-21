/**
 * Bilibili Study Companion Content Script
 * 负责寻找 B 站播放器包裹层，挂载独立的 ShadowRoot UI，
 * 注入全局隐藏原生字幕的样式，并桥接单词级取词翻译事件到 RTTR 的全局翻译/朗读管道中。
 */

import { createApp, watch } from 'vue';
import BiliStudyRoot from '@/components/bilibili/BiliStudyRoot.vue';
import { uiActions, uiState } from '@/utils/content-state';
import { settingsStorage } from '@/utils/storage';
import { speakText } from '@/utils/tts';
import { safeSendMessage } from '@/utils/content-messaging';
import { biliState, biliActions } from '@/utils/bilibili-state';

export default defineContentScript({
  matches: [
    '*://*.bilibili.com/video/*',
    '*://*.bilibili.com/list/*',
    '*://*.bilibili.com/medialist/*'
  ],
  cssInjectionMode: 'ui',
  async main(ctx) {
    // 0. 读取全局配置，判断是否开启 B 站精读增强
    const settings = await settingsStorage.getValue();
    if (!settings.enableBiliStudy) {
      console.log('[RTTR BiliStudy] 双语精读助手在设置中已全局禁用。');
      return;
    }

    console.log('[RTTR BiliStudy] 双语精读内容脚本已就绪！');

    let ui: any = null;
    let mountCheckInterval: ReturnType<typeof setInterval> | null = null;

    // 1. 注入全局样式，强力屏蔽 B 站自带字幕并定义自定义精读控制按钮样式
    const injectGlobalSubtitleHider = () => {
      if (document.getElementById('rttr-bili-subtitle-hider')) return;
      const style = document.createElement('style');
      style.id = 'rttr-bili-subtitle-hider';
      style.textContent = `
        /* 屏蔽B站播放器自带的简陋/原生字幕区域 */
        .bilibili-player-video-subtitle,
        .bili-video-subtitle,
        .subtitle-position,
        .bili-subtitle-wrap,
        .bili-video-player-video-subtitle {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        /* RTTR 精读自定义按钮默认状态：灰色、带透明度 */
        .rttr-bili-study-btn {
          opacity: 0.65 !important;
          color: #8590a6 !important; /* 经典深灰，与B站控制栏原生图标色调统一 */
          cursor: pointer !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }

        /* 确保在B站的各种浮动/弹性布局下都能垂直居中对齐 */
        #rttr-bili-study-trigger {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          height: 100% !important;
          vertical-align: middle !important;
        }

        .rttr-bili-study-btn .bpx-player-ctrl-btn-icon {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          height: 100% !important;
          width: 100% !important;
        }

        .rttr-bili-study-btn svg {
          display: block !important;
          transform: translateY(-3px) !important; /* 精准上移 3px 纠正B站原生容器导致的下偏问题 */
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }

        /* 字母默认填充为 currentColor，且无描边，极简扁平灰色 */
        .rttr-bili-study-btn .rttr-letter {
          fill: currentColor !important;
          stroke: transparent !important;
          stroke-width: 0px !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }

        /* 鼠标悬浮：微亮且稍微变大 */
        .rttr-bili-study-btn:hover {
          opacity: 0.95 !important;
          color: #ffffff !important;
        }
        .rttr-bili-study-btn:hover svg {
          transform: translateY(-4px) scale(1.05) !important; /* 悬停时向上微浮，展现立体感 */
        }

        /* 开启（激活）状态：完全不透明且应用金属渐变和精致重叠描边 */
        .rttr-bili-study-btn.active {
          opacity: 1 !important;
        }
        .rttr-bili-study-btn.active .rttr-letter {
          stroke: #020617 !important;
          stroke-width: 12px !important;
          stroke-linejoin: round !important;
        }
        .rttr-bili-study-btn.active .rttr-r1 {
          fill: url(#rttr-grad1) !important;
        }
        .rttr-bili-study-btn.active .rttr-t1 {
          fill: url(#rttr-grad2) !important;
        }
        .rttr-bili-study-btn.active .rttr-t2 {
          fill: url(#rttr-grad3) !important;
        }
        .rttr-bili-study-btn.active .rttr-r2 {
          fill: url(#rttr-grad4) !important;
        }

        /* ─── B站原生字幕交互增强 ─── */
        /* 字幕文本区：I 型文本选择光标，方便用户感知可以选词 */
        .bili-subtitle-x-subtitle-panel-text,
        .bilibili-player-video-subtitle-text,
        .bpx-player-subtitle-panel-text {
          cursor: text !important;
          user-select: text !important;
          -webkit-user-select: text !important;
        }

        /* 字幕容器（非文本区域）：保留移动光标 */
        .bili-subtitle-x-subtitle-panel,
        .bilibili-player-video-subtitle,
        .bpx-player-subtitle-panel {
          cursor: move;
        }

        /* 选中文本的高亮色 */
        .bili-subtitle-x-subtitle-panel-text::selection,
        .bilibili-player-video-subtitle-text::selection,
        .bpx-player-subtitle-panel-text::selection {
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
    };

    // 1.5 注入并管理 B 站原生控制栏中的“精读”按钮
    const injectControlButton = () => {
      const controlsWrap = document.querySelector('.bpx-player-control-bottom-right, .bilibili-player-video-control-bottom-right');
      if (!controlsWrap) return;

      // 避免重复创建
      let btn = document.getElementById('rttr-bili-study-trigger');
      if (btn) {
        if (biliState.studyActive) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
        return;
      }

      console.log('[RTTR BiliStudy] 找到播放器控制条，注入精读控制按钮...');

      btn = document.createElement('div');
      btn.id = 'rttr-bili-study-trigger';
      btn.className = 'bpx-player-ctrl-btn rttr-bili-study-btn';
      if (biliState.studyActive) {
        btn.classList.add('active');
      }
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', '双语精读');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('title', '开启/关闭 RTTR 双语精读学习助手');
      
      // 使用内联样式，精准适配B站各种分辨率和原生按钮结构
      btn.style.width = '36px';
      btn.style.height = '100%';
      btn.style.cursor = 'pointer';
      btn.style.userSelect = 'none';
      btn.style.position = 'relative';
      btn.style.margin = '0 4px';
      btn.style.transition = 'all 0.2s ease';

      btn.innerHTML = `
        <div class="bpx-player-ctrl-btn-icon" style="display: flex; align-items: center; justify-content: center; height: 100%; width: 100%;">
          <svg viewBox="0 0 700 300" style="width: 28px; height: 12px; transition: all 0.2s ease;">
            <defs>
              <linearGradient id="rttr-grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#94a3b8" />
                <stop offset="100%" stop-color="#475569" />
              </linearGradient>
              <linearGradient id="rttr-grad2" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#cbd5e1" />
                <stop offset="100%" stop-color="#64748b" />
              </linearGradient>
              <linearGradient id="rttr-grad3" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#e2e8f0" />
                <stop offset="100%" stop-color="#94a3b8" />
              </linearGradient>
              <linearGradient id="rttr-grad4" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#ffffff" />
                <stop offset="100%" stop-color="#cbd5e1" />
              </linearGradient>
            </defs>
            <!-- 第一层：R1 -->
            <path class="rttr-letter rttr-r1" d="M 0 0 h 140 c 44 0 80 36 80 80 v 20 c 0 32 -18 60 -45 72 l 75 128 h -70 l -65 -115 h -55 v 115 h -60 z M 60 60 v 65 h 70 c 14 0 25 -11 25 -25 v -15 c 0 -14 -11 -25 -25 -25 h -70 z" fill-rule="evenodd" />
            <!-- 第二层：T1 (覆盖 R1) -->
            <path class="rttr-letter rttr-t1" d="M 160 0 h 200 v 60 h -70 v 240 h -60 v -240 h -70 z" />
            <!-- 第三层：T2 (覆盖 T1) -->
            <path class="rttr-letter rttr-t2" d="M 320 0 h 200 v 60 h -70 v 240 h -60 v -240 h -70 z" />
            <!-- 第四层：R2 (最高层，覆盖 T2) -->
            <path class="rttr-letter rttr-r2" d="M 480 0 h 140 c 44 0 80 36 80 80 v 20 c 0 32 -18 60 -45 72 l 75 128 h -70 l -65 -115 h -55 v 115 h -60 z M 540 60 v 65 h 70 c 14 0 25 -11 25 -25 v -15 c 0 -14 -11 -25 -25 -25 h -70 z" fill-rule="evenodd" />
          </svg>
        </div>
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        biliActions.setStudyActive(!biliState.studyActive);
      });

      // 自动插入到控制栏最前端（清晰度左侧附近）
      if (controlsWrap.firstChild) {
        controlsWrap.insertBefore(btn, controlsWrap.firstChild);
      } else {
        controlsWrap.appendChild(btn);
      }
    };

    // 2. 挂载精读助手 UI 到播放器包裹层
    const mountStudyUI = async () => {
      // 兼容 B 站不同播放器模式（常规播放器，以及全屏下的包裹容器）
      const anchor = document.querySelector('.bpx-player-container, .bili-video-player, .bilibili-player-video-wrap, #bilibili-player, #bilibiliPlayer') as HTMLElement;
      if (!anchor) return;

      // 如果已经成功挂载并且节点有效，跳过
      const existingHost = document.querySelector('rttr-bili-study-ui');
      if (existingHost && anchor.contains(existingHost)) {
        // 哪怕 UI 部分挂载完毕，也要随时注入或者更新原生控制栏中的“精读”按钮（因为切换视频时控制栏可能被B站重绘）
        injectControlButton();
        return;
      }

      // 如果节点断开/失效，先清理
      if (ui) {
        try {
          ui.remove();
        } catch (e) {}
        ui = null;
      }

      console.log('[RTTR BiliStudy] 找到播放器容器，开始挂载 Vue 精读 UI...');
      injectGlobalSubtitleHider();
      injectControlButton();

      try {
        ui = await createShadowRootUi(ctx, {
          name: 'rttr-bili-study-ui',
          position: 'inline',
          anchor: () => anchor,
          append: 'last',
          onMount: (container) => {
            // 设置 shadow-host 覆盖整个播放区，但允许鼠标穿透
            const root = container.getRootNode() as ShadowRoot;
            if (root.host) {
              const host = root.host as HTMLElement;
              host.style.position = 'absolute';
              host.style.top = '0';
              host.style.left = '0';
              host.style.width = '100%';
              host.style.height = '100%';
              host.style.pointerEvents = 'none';
              host.style.zIndex = '99999';
            }

            const app = createApp(BiliStudyRoot);
            app.mount(container);
            return app;
          },
          onRemove: (app) => {
            app?.unmount();
          }
        });

        ui.mount();
      } catch (err) {
        console.error('[RTTR BiliStudy] 挂载 ShadowRoot UI 失败:', err);
      }
    };

    // 3. 轮询挂载，兼容 SPA 页面无缝切换视频
    mountCheckInterval = setInterval(mountStudyUI, 1500);
    mountStudyUI(); // 立即尝试挂载

    // 3.5 原生字幕悬停暂停功能
    // 监听 B 站原生字幕元素的出现，动态绑定 mouseenter/mouseleave 事件
    let hoverPausedByUs = false; // 标记是否是我们触发的暂停，避免干扰用户手动暂停
    let hoverDebounce: ReturnType<typeof setTimeout> | null = null;
    const boundSubtitleElements = new WeakSet<Element>();

    const handleSubtitleMouseEnter = () => {
      if (biliState.subtitleHoverPause !== 'hover') return;
      // 稍作防抖，避免鼠标快速划过误触
      hoverDebounce = setTimeout(() => {
        const video = document.querySelector('video, bwp-video') as HTMLVideoElement;
        if (video && !video.paused) {
          video.pause();
          hoverPausedByUs = true;
          console.log('[RTTR BiliStudy] 悬停原生字幕→自动暂停视频');
        }
      }, 120);
    };

    const handleSubtitleMouseLeave = () => {
      // 取消防抖计时器
      if (hoverDebounce) {
        clearTimeout(hoverDebounce);
        hoverDebounce = null;
      }
      // 仅当是我们触发的暂停时才自动恢复播放（hover/click 两种模式都适用）
      if (hoverPausedByUs) {
        const video = document.querySelector('video, bwp-video') as HTMLVideoElement;
        if (video && video.paused) {
          video.play();
          console.log('[RTTR BiliStudy] 离开原生字幕→自动恢复播放');
        }
        hoverPausedByUs = false;
      }
    };

    const bindHoverToSubtitleElement = (el: Element) => {
      if (boundSubtitleElements.has(el)) return;
      boundSubtitleElements.add(el);
      el.addEventListener('mouseenter', handleSubtitleMouseEnter);
      el.addEventListener('mouseleave', handleSubtitleMouseLeave);

      // 点击查词高亮 + 点击暂停模式
      el.addEventListener('click', (e: Event) => {
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
        if (biliState.subtitleHoverPause === 'click' && !hoverPausedByUs) {
          const video = document.querySelector('video, bwp-video') as HTMLVideoElement;
          if (video && !video.paused) {
            video.pause();
            hoverPausedByUs = true;
            console.log('[RTTR BiliStudy] 点击字幕单词→暂停视频');
          }
        }

        // 切分文本节点，用带颜色的 span 包裹目标单词
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
        } catch (err) {
          // surroundContents 在跨节点时可能失败，静默忽略
        }
      });
    };

    // 立即扫描已存在的原生字幕元素
    const scanAndBindSubtitles = () => {
      const subtitleEls = document.querySelectorAll(
        '.bili-subtitle-x-subtitle-panel-text, .bilibili-player-video-subtitle-text, .bpx-player-subtitle-panel-text'
      );
      subtitleEls.forEach(bindHoverToSubtitleElement);
    };

    // 使用 MutationObserver 监听 B 站原生字幕的动态插入
    const subtitleObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          // 检查新增的节点本身是否是字幕元素
          if (
            node.classList.contains('bili-subtitle-x-subtitle-panel-text') ||
            node.classList.contains('bilibili-player-video-subtitle-text') ||
            node.classList.contains('bpx-player-subtitle-panel-text')
          ) {
            bindHoverToSubtitleElement(node);
          }
          // 检查子元素中是否包含字幕
          const childSubs = node.querySelectorAll(
            '.bili-subtitle-x-subtitle-panel-text, .bilibili-player-video-subtitle-text, .bpx-player-subtitle-panel-text'
          );
          childSubs.forEach(bindHoverToSubtitleElement);
        }
      }
    });

    subtitleObserver.observe(document.body, { childList: true, subtree: true });
    scanAndBindSubtitles(); // 首次立即扫描

    // 4. 监听字幕中单词点击触发的 rttr-lookup-word 事件，桥接核心翻译和发音引擎
    const handleWordLookup = async (e: Event) => {
      const customEvent = e as CustomEvent<{ word: string; rect: DOMRect; event: MouseEvent }>;
      const { word, rect } = customEvent.detail;

      if (!word) return;
      console.log('[RTTR BiliStudy] 接收到字幕单词点击事件:', word);

      // 获取用户偏好设置
      let settings: any;
      try {
        settings = await settingsStorage.getValue();
      } catch (err) {
        settings = {
          enableClickPronounce: true,
          showSingleClickIPA: true,
          enableClickTranslate: true,
          translationEngine: 'AI'
        };
      }

      if (!settings.enabled) return;

      // a. 触发朗读 / 发音
      if (settings.enableClickPronounce) {
        speakText(word, settings);
      }

      // b. 呈现发音音标与 TTS 图标，然后异步加载 standard IPA
      const speakerSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
      uiActions.showPronounceBadge(speakerSVG, rect, true, word);

      if (settings.showSingleClickIPA) {
        safeSendMessage({ type: 'LOOKUP_IPA', word }).then((resp: any) => {
          const ipa = resp?.ipa || null;
          if (ipa) {
            uiActions.showPronounceBadge(ipa, rect, false, word);
          }
        });
      }

      // c. 获取单词翻译并更新 pronounceBadge
      if (settings.enableClickTranslate && settings.translationEngine !== 'none') {
        const engine = settings.translationEngine;
        safeSendMessage({
          type: 'FETCH_TRANSLATION',
          text: word,
          sourceLang: 'auto',
          targetLang: settings.targetLanguage || 'zh-CN',
          engine
        }).then((resp: any) => {
          if (resp && resp.targetText) {
            uiActions.updatePronounceBadgeTranslation(resp.targetText);
          }
        });
      }
    };

    window.addEventListener('rttr-lookup-word', handleWordLookup);

    // 4.5 监听 studyActive 状态，实时反馈到原生按钮样式上
    const unwatchStudyActive = watch(() => biliState.studyActive, (active) => {
      const btn = document.getElementById('rttr-bili-study-trigger');
      if (btn) {
        if (active) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });

    // 4.6 监听 settingsStorage 的变化，实时同步全局设置到播放器状态
    const unwatchSettings = settingsStorage.watch((newSettings) => {
      if (newSettings) {
        biliState.autoPause = newSettings.biliAutoPause;
        biliState.customSubtitlesEnabled = newSettings.biliCustomSubtitles;
        biliState.hudVisible = newSettings.biliHudVisible;
        biliState.subtitleHoverPause = newSettings.biliSubtitleHoverPause;
      }
    });

    // 5. 页面卸载清理
    ctx?.onInvalidated(() => {
      if (mountCheckInterval) {
        clearInterval(mountCheckInterval);
      }
      if (ui) {
        try {
          ui.remove();
        } catch (e) {}
      }
      window.removeEventListener('rttr-lookup-word', handleWordLookup);
      
      const hider = document.getElementById('rttr-bili-subtitle-hider');
      if (hider) hider.remove();

      const btn = document.getElementById('rttr-bili-study-trigger');
      if (btn) btn.remove();

      unwatchStudyActive();
      unwatchSettings();

      // 清理字幕悬停监听器
      subtitleObserver.disconnect();
      if (hoverDebounce) clearTimeout(hoverDebounce);
    });
  }
});
