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

    // 1. 注入全局样式，定义自定义精读控制按钮样式
    const injectGlobalStyles = () => {
      if (document.getElementById('rttr-bili-study-styles')) return;
      const style = document.createElement('style');
      style.id = 'rttr-bili-study-styles';
      style.textContent = `
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
        #rttr-bili-study-trigger:hover svg {
          transform: translateY(-4px) scale(1.05) !important; /* 悬停时向上微浮，展现立体感 */
        }

        /* 开启（激活）状态：完全不透明且应用金属渐变和精致重叠描边 */
        .rttr-bili-study-btn.active {
          opacity: 1 !important;
          color: #ffffff !important;
        }

        #rttr-bili-study-trigger.active .rttr-letter {
          stroke: #020617 !important;
          stroke-width: 12px !important;
          stroke-linejoin: round !important;
        }
        #rttr-bili-study-trigger.active .rttr-r1 {
          fill: url(#rttr-grad1) !important;
        }
        #rttr-bili-study-trigger.active .rttr-t1 {
          fill: url(#rttr-grad2) !important;
        }
        #rttr-bili-study-trigger.active .rttr-t2 {
          fill: url(#rttr-grad3) !important;
        }
        #rttr-bili-study-trigger.active .rttr-r2 {
          fill: url(#rttr-grad4) !important;
        }
      `;
      document.head.appendChild(style);
    };

    // 动态控制隐藏原生字幕的样式
    const updateSubtitleHider = () => {
      let hider = document.getElementById('rttr-bili-subtitle-hider');
      if (!hider) {
        hider = document.createElement('style');
        hider.id = 'rttr-bili-subtitle-hider';
        document.head.appendChild(hider);
      }

      if (biliState.studyActive && biliState.customSubtitlesEnabled) {
        hider.textContent = `
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
        `;
      } else {
        hider.textContent = '';
      }
    };

    // 1.5 注入并管理 B 站原生控制栏中的“精读”按钮
    const injectControlButton = () => {
      const controlsWrap = document.querySelector('.bpx-player-control-bottom-right, .bilibili-player-video-control-bottom-right') as HTMLElement;
      if (!controlsWrap) return;

      // 强力防脱落守卫 1：确保控制条真的渲染出来了且高度正常（如果高度为0，说明只是个没就绪的占位符，不进行注入）
      if (controlsWrap.offsetHeight === 0) return;

      // 1. RTTR 精读主开关按钮
      let studyBtn = controlsWrap.querySelector('#rttr-bili-study-trigger') as HTMLElement;
      if (!studyBtn) {
        console.log('[RTTR BiliStudy] 找到播放器控制条，注入精读控制按钮...');
        studyBtn = document.createElement('div');
        studyBtn.id = 'rttr-bili-study-trigger';
        studyBtn.className = 'bpx-player-ctrl-btn rttr-bili-study-btn';
        studyBtn.setAttribute('role', 'button');
        studyBtn.setAttribute('aria-label', '双语精读');
        studyBtn.setAttribute('tabindex', '0');
        studyBtn.setAttribute('title', '开启/关闭 RTTR 双语精读学习助手');
        
        studyBtn.style.width = '36px';
        studyBtn.style.height = '100%';
        studyBtn.style.cursor = 'pointer';
        studyBtn.style.userSelect = 'none';
        studyBtn.style.position = 'relative';
        studyBtn.style.margin = '0 4px';
        studyBtn.style.transition = 'all 0.2s ease';

        studyBtn.innerHTML = `
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

        studyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const nextActive = !biliState.studyActive;
          biliActions.setStudyActive(nextActive);
          // 一键联动：开启精读时，也直接开启双语字幕；关闭精读时，关闭双语字幕并释放原生字幕
          biliActions.setCustomSubtitlesEnabled(nextActive);
        });

        // 自动插入到控制栏最前端（清晰度左侧附近）
        if (controlsWrap.firstChild) {
          controlsWrap.insertBefore(studyBtn, controlsWrap.firstChild);
        } else {
          controlsWrap.appendChild(studyBtn);
        }
      }

      // 更新 studyBtn 激活样式
      if (biliState.studyActive) {
        studyBtn.classList.add('active');
      } else {
        studyBtn.classList.remove('active');
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
      injectGlobalStyles();
      updateSubtitleHider();
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
              host.style.zIndex = '2147483647';
              host.style.overflow = 'visible';
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

    // 3.5 全屏切换事件监听：实现进入/退出全屏时 50ms 内瞬间重置并注入控制条，消除 1.5s 轮询带来的视觉迟滞
    const instantUpdate = () => {
      setTimeout(() => {
        mountStudyUI();
      }, 50);
    };
    document.addEventListener('fullscreenchange', instantUpdate);
    document.addEventListener('webkitfullscreenchange', instantUpdate);

    // 4. 监听字幕中单词点击触发的 rttr-lookup-word 事件，桥接核心翻译和发音引擎
    const handleWordLookup = async (e: Event) => {
      const customEvent = e as CustomEvent<{ word: string; rect: DOMRect; event: MouseEvent }>;
      const { word, rect } = customEvent.detail;

      if (!word) return;

      const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      if (isFullscreen) {
        console.log(`[RTTR Fullscreen Click] Clicked word "${word}" in physical fullscreen mode.`);
      }

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
            if (isFullscreen) {
              console.log(`[RTTR Fullscreen Click] Loaded IPA for "${word}": ${ipa}`);
            }
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
            if (isFullscreen) {
              console.log(`[RTTR Fullscreen Click] Loaded translation for "${word}": ${resp.targetText}`);
            }
          }
        });
      }
    };

    window.addEventListener('rttr-lookup-word', handleWordLookup);

    // 4.5 监听 studyActive 状态，实时反馈到原生按钮样式上，并更新字幕隐藏器
    const unwatchStudyActive = watch(() => biliState.studyActive, (active) => {
      const controlsWrap = document.querySelector('.bpx-player-control-bottom-right, .bilibili-player-video-control-bottom-right');
      if (controlsWrap) {
        const studyBtn = controlsWrap.querySelector('#rttr-bili-study-trigger');
        if (studyBtn) {
          if (active) {
            studyBtn.classList.add('active');
          } else {
            studyBtn.classList.remove('active');
          }
        }
      }
      updateSubtitleHider();
    });

    // 4.55 监听 packageLoaded 状态，同步更新字幕隐藏器
    const unwatchPackageLoaded = watch(() => biliState.packageLoaded, () => {
      updateSubtitleHider();
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
      
      document.removeEventListener('fullscreenchange', instantUpdate);
      document.removeEventListener('webkitfullscreenchange', instantUpdate);

      const hider = document.getElementById('rttr-bili-subtitle-hider');
      if (hider) hider.remove();

      const styles = document.getElementById('rttr-bili-study-styles');
      if (styles) styles.remove();

      const studyBtn = document.getElementById('rttr-bili-study-trigger');
      if (studyBtn) studyBtn.remove();

      unwatchStudyActive();
      unwatchPackageLoaded();
      unwatchSettings();
    });
  }
});
