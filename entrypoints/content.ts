/**
 * RTTR Content Script — 核心标注引擎
 *
 * 功能：
 * 1. 追踪鼠标悬浮的段落元素
 * 2. Alt+T 快捷键触发翻译
 * 3. 发送段落给 Background 进行 AI 翻译
 * 4. 将结果注入为 <ruby> 标注
 * 5. 点击标注词 → 标记为已知词
 */

import type { AnnotationResult } from '@/utils/ai';
import type { TranslateResponse, DismissWordResponse } from '@/utils/messaging';
import { settingsStorage, type RTTRSettings } from '@/utils/storage';

// ─── 常量 ────────────────────────────────────────────────

const RTTR_ATTR = 'data-rttr-annotated';
const RTTR_LOADING_ATTR = 'data-rttr-loading';

// 标注调色板 — 柔和但可区分的颜色
const ANNOTATION_COLORS = [
  '#5B9BD5', // 蓝
  '#70AD47', // 绿
  '#ED7D31', // 橙
  '#A855F7', // 紫
  '#44BEC7', // 青
  '#F472B6', // 粉
  '#FACC15', // 黄
  '#EF4444', // 红
  '#6366F1', // 靛蓝
  '#34D399', // 翡翠
  '#FB923C', // 琥珀
  '#C084FC', // 薰衣草
];
const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'SECTION']);

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main(ctx) {
    let hoveredElement: HTMLElement | null = null;
    let isDraggingRttrWord = false;
    let currentSettings: RTTRSettings | null = null;

    // ─── 初始化并监听设置变化 ──────────────────────────────
    settingsStorage.getValue().then((val) => {
      currentSettings = val;
    });
    settingsStorage.watch((newVal) => {
      if (newVal) currentSettings = newVal;
    });

    // ─── 阻止拖拽残影飞回的动画 ──────────────────────────
    // 只有在我们自己的单词被拖拽时，才允许在全局任意位置放下，从而阻止浏览器默认的飞回动画
    document.addEventListener('dragover', (e) => {
      if (isDraggingRttrWord) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
      }
    });

    // ─── 注入样式 ──────────────────────────────────────
    injectStyles();

    // ─── 追踪鼠标悬浮元素 ──────────────────────────────
    document.addEventListener('mousemove', (e) => {
      hoveredElement = e.target as HTMLElement;
    });

    // ─── 监听快捷键（Alt+T） ───────────────────────────
    document.addEventListener('keydown', (e) => {
      // macOS 上 Option+T 会产生 '†'，所以用 e.code 而非 e.key
      if (e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        handleTranslate(hoveredElement);
      }
    });

    // ─── 监听来自 Background 的命令（Chrome Commands API）
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'TRIGGER_TRANSLATE') {
        handleTranslate(hoveredElement);
      }
    });

    // ─── 翻译处理函数 ──────────────────────────────────
    async function handleTranslate(target: HTMLElement | null) {
      if (!target) return;

      // 向上查找最近的块级元素
      const paragraph = findParagraph(target);
      if (!paragraph) {
        console.log('[RTTR] 未找到段落元素');
        return;
      }

      // 跳过已翻译的段落
      if (paragraph.hasAttribute(RTTR_ATTR)) {
        // 二次触发 → 清除标注
        clearAnnotations(paragraph);
        return;
      }

      // 跳过正在加载的段落
      if (paragraph.hasAttribute(RTTR_LOADING_ATTR)) return;

      const text = paragraph.innerText.trim();
      if (!text || text.length < 5) return;

      // 设置加载状态
      paragraph.setAttribute(RTTR_LOADING_ATTR, 'true');

      try {
        // 发送翻译请求到 Background
        const response = await browser.runtime.sendMessage({
          type: 'TRANSLATE',
          text,
        }) as TranslateResponse;

        if (!response.success || !response.results) {
          throw new Error(response.error || '翻译失败');
        }

        // 注入 Ruby 标注
        applyAnnotations(paragraph, response.results);
      } catch (err) {
        console.error('[RTTR] 翻译错误:', err);
      } finally {
        paragraph.removeAttribute(RTTR_LOADING_ATTR);
      }
    }

    // ─── 查找段落元素 ──────────────────────────────────
    function findParagraph(el: HTMLElement | null): HTMLElement | null {
      while (el) {
        if (BLOCK_TAGS.has(el.tagName)) return el;
        el = el.parentElement;
      }
      return null;
    }

    // ─── 注入 Ruby 标注 ────────────────────────────────
    function applyAnnotations(
      paragraph: HTMLElement,
      results: AnnotationResult[]
    ) {
      // 保存原始 HTML 用于恢复
      paragraph.setAttribute('data-rttr-original', paragraph.innerHTML);
      paragraph.setAttribute(RTTR_ATTR, 'true');

      // 构建词汇映射（大小写不敏感），并分配颜色
      const wordMap = new Map<string, { translation: string; explanation?: string; pronunciation?: string; ipa?: string; color: string }>();
      results.forEach(({ word, translation, explanation, pronunciation, ipa }, i) => {
        wordMap.set(word.toLowerCase(), {
          translation,
          explanation,
          pronunciation,
          ipa,
          color: ANNOTATION_COLORS[i % ANNOTATION_COLORS.length],
        });
      });

      // 遍历文本节点并替换
      const walker = document.createTreeWalker(
        paragraph,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes: Text[] = [];
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        textNodes.push(node);
      }

      for (const textNode of textNodes) {
        const fragment = annotateTextNode(textNode, wordMap);
        if (fragment) {
          textNode.replaceWith(fragment);
        }
      }
    }

    // ─── 撤销栈管理 (Cmd+Z) ────────────────────────────
    interface UndoAction {
      wrapper: HTMLElement;
      textNode: Text;
      word: string;
    }
    const undoStack: UndoAction[] = [];

    document.addEventListener('keydown', (e) => {
      // Cmd+Z (Mac) or Ctrl+Z (Windows)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        const target = e.target as HTMLElement;
        // 如果焦点在输入框，则不拦截系统撤销
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

        const lastAction = undoStack.pop();
        if (lastAction) {
          e.preventDefault();
          undoDismiss(lastAction);
        }
      }
    });

    async function undoDismiss(action: UndoAction) {
      const { wrapper, textNode, word } = action;
      try {
        const response = await browser.runtime.sendMessage({
          type: 'UNDISMISS_WORD',
          word,
        }) as any;

        if (response?.success) {
          wrapper.classList.remove('rttr-dismissing');
          textNode.replaceWith(wrapper);
        } else {
          // 失败了放回栈中
          undoStack.push(action);
        }
      } catch (err) {
        console.error('[RTTR] 撤销失败:', err);
        undoStack.push(action);
      }
    }

    // ─── 全局悬浮窗管理 ────────────────────────────────
    let tooltipEl: HTMLElement | null = null;
    let currentUtterance: SpeechSynthesisUtterance | null = null; // 防止 Chrome GC 导致语音中断

    function getOrCreateTooltip(): HTMLElement {
      if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'rttr-global-tooltip';
        document.body.appendChild(tooltipEl);
      }
      return tooltipEl;
    }

    function showTooltip(text: string, rect: DOMRect) {
      const el = getOrCreateTooltip();
      el.textContent = text;
      
      // 先加上 class 以获取实际渲染尺寸
      el.classList.add('rttr-visible');
      
      // 恢复原有的 -8px，避免普通标注显得太远
      const top = window.scrollY + rect.top - 8;
      const left = window.scrollX + rect.left + (rect.width / 2);
      
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
      el.style.transform = 'translate(-50%, -100%) scale(0.95)';
    }

    function hideTooltip() {
      if (tooltipEl) {
        tooltipEl.classList.remove('rttr-visible');
      }
    }

    // ─── 语音合成 (TTS) ────────────────────────────────
    function speakText(text: string, onComplete?: () => void) {
      console.log(`[RTTR TTS] 准备朗读文本: "${text}"`);
      if (!('speechSynthesis' in window)) {
        console.error('[RTTR TTS] 当前浏览器不支持 speechSynthesis');
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      
      if (currentSettings) {
        utterance.lang = currentSettings.ttsLanguage || 'en-US';
        utterance.rate = currentSettings.ttsRate || 0.85;
        utterance.volume = currentSettings.ttsVolume ?? 1.0;
        
        const voices = window.speechSynthesis.getVoices();
        console.log(`[RTTR TTS] 当前系统可用声音数量: ${voices.length}`);
        
        const voiceURI = currentSettings.ttsVoiceURI;
        if (voiceURI) {
          console.log(`[RTTR TTS] 用户配置了指定发音人 URI: ${voiceURI}`);
          const selectedVoice = voices.find(v => v.voiceURI === voiceURI);
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log(`[RTTR TTS] 成功匹配发音人: ${selectedVoice.name}`);
          } else {
            console.warn(`[RTTR TTS] 未找到指定的发音人，将使用系统默认`);
          }
        } else {
          console.log(`[RTTR TTS] 用户未配置发音人，尝试匹配 Google US English`);
          const googleVoice = voices.find(v => v.name.includes('Google US English'));
          if (googleVoice) {
            utterance.voice = googleVoice;
            console.log(`[RTTR TTS] 成功匹配到 Google US English`);
          } else {
            console.warn(`[RTTR TTS] 未找到 Google US English，将使用系统默认`);
          }
        }
      } else {
        console.warn(`[RTTR TTS] currentSettings 为空，使用兜底配置`);
        utterance.lang = 'en-US';
        utterance.rate = 0.85;
      }
      
      utterance.onstart = () => console.log('[RTTR TTS] 开始朗读...');
      utterance.onend = () => {
        console.log('[RTTR TTS] 朗读结束.');
        if (onComplete) onComplete();
      };
      utterance.onerror = (e) => {
        if (e.error === 'interrupted') {
          // 正常打断，不作为错误抛出
          console.log('[RTTR TTS] 朗读已切换/被打断');
        } else {
          console.error('[RTTR TTS] 朗读发生错误, 原因:', e.error);
        }
        if (onComplete) onComplete();
      };

      currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    }

    // ─── 标注单个文本节点 ──────────────────────────────
    function annotateTextNode(
      textNode: Node,
      wordMap: Map<string, { translation: string; explanation?: string; pronunciation?: string; ipa?: string; color: string }>
    ): DocumentFragment | null {
      const text = textNode.textContent || '';
      if (!text.trim()) return null;

      // 构建正则：按词长降序匹配（优先匹配 small-scale 而非 small）
      const escapedWords = Array.from(wordMap.keys())
        .sort((a, b) => b.length - a.length)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

      if (escapedWords.length === 0) return null;

      const pattern = new RegExp(`(\\b(?:${escapedWords.join('|')})\\b)`, 'gi');
      const parts = text.split(pattern);

      if (parts.length <= 1) return null; // 没有匹配

      let hasAnnotation = false;
      const fragment = document.createDocumentFragment();

      for (const part of parts) {
        const lower = part.toLowerCase();
        const entry = wordMap.get(lower);

        if (entry) {
          const isSameTranslation = part.toLowerCase() === entry.translation.toLowerCase();

          // 统一使用 ruby，哪怕翻译和原文一样，我们把 rt 置空即可（点击时仍可显示音标）
          let wrapper = document.createElement('ruby');
          wrapper.className = 'rttr-word';
          wrapper.style.color = entry.color;
          
          // 如果包含多个单词，将每个单词用 span 包裹，以便点击时能精确获知点击了哪个词
          const subWords = part.split(/(\s+)/);
          subWords.forEach((subWord, idx) => {
            if (subWord.trim()) {
              const span = document.createElement('span');
              span.textContent = subWord;
              // 记录实义词的索引（忽略空格元素）
              span.dataset.idx = String(Math.floor(idx / 2));
              wrapper.appendChild(span);
            } else {
              wrapper.appendChild(document.createTextNode(subWord));
            }
          });

          if (entry.explanation) {
            wrapper.dataset.explanation = entry.explanation;
            wrapper.classList.add('rttr-has-tooltip');
          }

          const rt = document.createElement('rt');
          rt.className = 'rttr-translation';
          rt.style.color = entry.color;
          // 如果翻译等于原文，就不默认显示翻译（但 rt 占位留着，以便点击时闪现音标）
          rt.textContent = isSameTranslation ? '' : entry.translation;

          wrapper.appendChild(rt);

          // 悬浮窗事件
          if (entry.explanation) {
            wrapper.addEventListener('mouseenter', (e) => {
              const target = e.currentTarget as HTMLElement;
              showTooltip(target.dataset.explanation || '', target.getBoundingClientRect());
            });
            wrapper.addEventListener('mouseleave', () => {
              hideTooltip();
            });
          }

          // 点击标注 → 朗读 (TTS)
          wrapper.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const target = e.target as HTMLElement;
            // 默认整句朗读，但先不急着显示整句音标
            let textToSpeak = entry.pronunciation || part;
            let ipaToShow = entry.ipa;

            if (target.tagName === 'RT') {
              // 用户需求：点击上标时，不要出现长串音标，直接朗读 TTS 即可
              ipaToShow = '';
            } else if (target.tagName === 'SPAN' && target.dataset.idx) {
              const wordIdx = parseInt(target.dataset.idx, 10);
              
              // 拆分音标（去除头尾斜杠后按空格拆分）
              if (entry.ipa) {
                const cleanIpa = entry.ipa.replace(/^\/|\/$/g, '').trim();
                const ipaParts = cleanIpa.split(/\s+/);
                // 确保英文单词数和音标块数一致才进行精确匹配
                const wordCount = part.trim().split(/\s+/).length;
                if (ipaParts.length === wordCount && ipaParts[wordIdx]) {
                  ipaToShow = `/${ipaParts[wordIdx]}/`;
                  textToSpeak = target.textContent || textToSpeak;
                } else {
                  // 如果对不齐（比如AI在缩写里加了空格），为了避免把整个长句的音标塞进一个单词里，我们干脆不显示音标，但仍然只朗读这一个单词
                  ipaToShow = '';
                  textToSpeak = target.textContent || textToSpeak;
                }
              } else {
                // 如果没有音标，但也只想读这一个词
                textToSpeak = target.textContent || textToSpeak;
              }
            }
            
            // 查找 rt 元素并替换文本为音标
            const rtElement = wrapper.querySelector('rt');
            // 使用闭包中安全的初始值，防止快速连续点击时读取到已经被替换成的音标（导致永久卡在音标状态）
            const trueOriginalRtText = isSameTranslation ? '' : entry.translation;
            
            if (rtElement && ipaToShow) {
              rtElement.textContent = ipaToShow;
              wrapper.classList.add('rttr-playing-ipa');
              
              // 当闪现音标时，彻底隐藏悬浮窗以免视觉干扰或遮挡
              if (wrapper.dataset.explanation) {
                hideTooltip();
              }
            }

            speakText(textToSpeak, () => {
              // 朗读结束或错误时恢复
              if (rtElement && ipaToShow) {
                rtElement.textContent = trueOriginalRtText;
                wrapper.classList.remove('rttr-playing-ipa');
                
                // 如果鼠标仍悬停在该单词上，则重新显示悬浮窗
                if (wrapper.dataset.explanation && wrapper.matches(':hover')) {
                  requestAnimationFrame(() => {
                    showTooltip(wrapper.dataset.explanation!, wrapper.getBoundingClientRect());
                  });
                }
              }
            });
          });

          // 拖拽标注 → 标记为已知词 (扔掉)
          // 动态设置 draggable：默认 false 不干扰全局文本划选，仅在按住单词时设为 true
          wrapper.addEventListener('mousedown', () => {
            wrapper.draggable = true;
          });
          wrapper.addEventListener('mouseup', () => {
            wrapper.draggable = false;
          });
          wrapper.addEventListener('dragend', () => {
            wrapper.draggable = false;
          });

          let dragStartX = 0;
          let dragStartY = 0;

          wrapper.addEventListener('dragstart', (e) => {
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            isDraggingRttrWord = true;

            if (entry.explanation) hideTooltip();
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', part);
              
              // 解决拖拽残影被截断和错位的问题：用一个有 padding 的 div 包裹，保持 clone 原始行内渲染
              const dragImageContainer = document.createElement('div');
              dragImageContainer.style.position = 'absolute';
              dragImageContainer.style.top = '-10000px';
              dragImageContainer.style.left = '-10000px';
              dragImageContainer.style.padding = '20px'; // 提供足够的空间防止截断
              dragImageContainer.style.backgroundColor = 'transparent';
              
              const clone = wrapper.cloneNode(true) as HTMLElement;
              clone.classList.remove('rttr-is-dragging'); // 确保残影是全彩的
              dragImageContainer.appendChild(clone);
              
              document.body.appendChild(dragImageContainer);
              
              // 确保拖拽残影和鼠标抓取位置对齐
              const rect = wrapper.getBoundingClientRect();
              const offsetX = e.clientX - rect.left;
              const offsetY = e.clientY - rect.top;
              e.dataTransfer.setDragImage(dragImageContainer, 20 + offsetX, 20 + offsetY);
              
              // 用完后清理掉
              setTimeout(() => {
                dragImageContainer.remove();
              }, 0);
            }
            // 延迟一点点添加类名
            setTimeout(() => {
              wrapper.classList.add('rttr-is-dragging');
              // 刚开始拖拽时，默认就在原地，所以直接加上吸附状态
              wrapper.classList.add('rttr-will-snap-back');
            }, 0);
          });

          // 拖拽过程中的实时反馈（磁吸效果判定）
          wrapper.addEventListener('drag', (e) => {
            if (e.clientX === 0 && e.clientY === 0) return; // 忽略部分浏览器在 drag 结束时触发的 (0,0) 坐标

            const distance = Math.sqrt(
              Math.pow(e.clientX - dragStartX, 2) + 
              Math.pow(e.clientY - dragStartY, 2)
            );

            // 距离小于 30 像素时，触发原位置的“吸附/点亮”反馈
            if (distance <= 30) {
              wrapper.classList.add('rttr-will-snap-back');
            } else {
              wrapper.classList.remove('rttr-will-snap-back');
            }
          });

          wrapper.addEventListener('dragend', (e) => {
            e.preventDefault();
            isDraggingRttrWord = false;
            wrapper.classList.remove('rttr-is-dragging');
            wrapper.classList.remove('rttr-will-snap-back');
            
            // 如果又放回了原地（拖拽距离小于 30 像素），则不做处理
            const distance = Math.sqrt(
              Math.pow(e.clientX - dragStartX, 2) + 
              Math.pow(e.clientY - dragStartY, 2)
            );
            
            if (distance > 30) {
              dismissWord(wrapper, lower, part);
            }
          });

          fragment.appendChild(wrapper);
          hasAnnotation = true;
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      }

      return hasAnnotation ? fragment : null;
    }

    // ─── 取消标注（标记为已知词） ──────────────────────
    async function dismissWord(ruby: HTMLElement, word: string, originalText: string) {
      // 动画淡出
      ruby.classList.add('rttr-dismissing');

      try {
        const response = await browser.runtime.sendMessage({
          type: 'DISMISS_WORD',
          word,
        }) as DismissWordResponse;

        if (response.success) {
          // 替换 ruby 为纯文本
          setTimeout(() => {
            const textNode = document.createTextNode(originalText);
            ruby.replaceWith(textNode);
            
            // 加入撤销栈
            undoStack.push({ wrapper: ruby, textNode, word });
            if (undoStack.length > 50) undoStack.shift(); // 限制最多50步
          }, 300);
        }
      } catch (err) {
        console.error('[RTTR] 标记已知词失败:', err);
        ruby.classList.remove('rttr-dismissing');
      }
    }

    // ─── 清除段落标注 ──────────────────────────────────
    function clearAnnotations(paragraph: HTMLElement) {
      const original = paragraph.getAttribute('data-rttr-original');
      if (original) {
        paragraph.innerHTML = original;
      }
      paragraph.removeAttribute(RTTR_ATTR);
      paragraph.removeAttribute('data-rttr-original');
    }

    // ─── 注入样式 ──────────────────────────────────────
    function injectStyles() {
      const style = document.createElement('style');
      style.id = 'rttr-injected-styles';
      style.textContent = `
        /* ─── RTTR Ruby 标注样式 ─── */
        .rttr-word {
          color: var(--rttr-color, #4a90d9);
          cursor: text;
          position: relative;
          transition: opacity 0.3s ease, color 0.2s ease;
          user-select: text !important;
          -webkit-user-select: text !important;
        }

        /* 强制选中状态有背景色，防止因为可拖拽属性或行内块导致无选中反馈 */
        .rttr-word::selection,
        .rttr-word *::selection {
          background-color: #b3d4fc !important;
          color: #000 !important;
        }

        .rttr-word:hover {
          color: var(--rttr-color-hover, #2a70b9);
        }

        /* 带有悬浮窗解释的词 */
        span.rttr-tooltip-only, ruby.rttr-has-tooltip {
          border-bottom: 1px dashed currentColor;
        }

        ruby.rttr-word rt.rttr-translation {
          cursor: pointer;
          font-size: 0.55em;
          color: inherit;
          opacity: 0.85;
          font-weight: 400;
          letter-spacing: 0;
          line-height: 1;
          padding: 0;
          text-align: center;
          ruby-align: center;
          user-select: none;
          -webkit-user-select: none;
          /* 将上标稍微往下移一点，靠近底部的英文，防止撞到上一行 */
          transform: translateY(0.15em);
          transition: all 0.2s ease; /* 增加平滑过渡效果 */
        }

        ruby.rttr-word.rttr-playing-ipa rt.rttr-translation {
          font-size: 0.8em;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: #3282ff !important;
          opacity: 1;
          transform: translateY(0); /* 字体变大时恢复标准位置 */
        }

        /* 强制给包含标注的段落增加一点行高，防止拥挤 */
        [data-rttr-annotated="true"] {
          line-height: 1.8 !important;
        }

        ruby.rttr-word:hover rt.rttr-translation {
          opacity: 1;
        }

        /* 取消标注动画 */
        .rttr-word.rttr-dismissing {
          opacity: 0;
          transform: scale(0.95);
          transition: all 0.3s ease;
        }

        /* 拖拽中留在原地的词：变成一个具有物理感的凹陷“空槽” (Empty Dropzone Slot) */
        .rttr-word.rttr-is-dragging {
          color: transparent !important; /* 彻底隐藏原本的文字，仿佛被拿走了 */
          background-color: rgba(0, 0, 0, 0.04); /* 浅灰底色 */
          border-radius: 4px;
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.1); /* 内阴影制造物理凹陷感 */
          outline: 1.5px dashed rgba(0, 0, 0, 0.2); /* 虚线框暗示这是个槽位 */
          outline-offset: 2px;
          transition: all 0.2s ease;
          cursor: grabbing !important;
        }
        
        .rttr-word.rttr-is-dragging rt.rttr-translation {
          color: transparent !important;
        }

        .rttr-word.rttr-is-dragging * {
          cursor: grabbing !important;
        }
        
        /* 原地吸附的准备状态（拖拽回原位附近）：插槽感应发光 (Magnetic Glow) */
        .rttr-word.rttr-will-snap-back {
          background-color: rgba(74, 144, 217, 0.1) !important;
          outline: 2px dashed rgba(74, 144, 217, 0.9) !important;
          outline-offset: 3px !important;
          box-shadow: inset 0 0 6px rgba(74, 144, 217, 0.2), 0 0 12px rgba(74, 144, 217, 0.4) !important; /* 内外双重发光 */
          transform: scale(1.04); /* 整体轻微放大，准备迎接吸附 */
          transition: all 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28); /* Q弹动画 */
        }

        /* ─── 悬浮窗样式 (Premium UI) ─── */
        #rttr-global-tooltip {
          visibility: hidden;
          opacity: 0;
          transform: translateY(4px) scale(0.98);
          position: absolute;
          z-index: 2147483647; /* MAX Z-INDEX */
          background: rgba(28, 28, 30, 0.95);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #f5f5f7;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.5;
          letter-spacing: 0.02em;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.08);
          pointer-events: none;
          white-space: pre-wrap;
          max-width: 280px;
          text-align: center;
          font-family: system-ui, -apple-system, sans-serif;
          transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), 
                      transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      visibility 0.2s;
        }

        #rttr-global-tooltip.rttr-visible {
          visibility: visible;
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        
        /* 底部的小三角 */
        #rttr-global-tooltip::after {
          content: '';
          position: absolute;
          bottom: -5px;
          left: 50%;
          margin-left: -5px;
          border-width: 5px 5px 0 5px;
          border-style: solid;
          border-color: rgba(28, 28, 30, 0.95) transparent transparent transparent;
        }

        /* 加载指示器 — 行末旋转圆环 */
        [data-rttr-loading="true"] {
          opacity: 0.5;
          transition: opacity 0.2s ease;
        }

        [data-rttr-loading="true"]::after {
          content: '';
          display: inline-block;
          width: 14px;
          height: 14px;
          margin-left: 6px;
          vertical-align: middle;
          border: 2px solid rgba(150, 150, 150, 0.25);
          border-top-color: #999;
          border-radius: 50%;
          animation: rttr-spin 0.7s linear infinite;
        }

        @keyframes rttr-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    // 处理上下文失效
    ctx.onInvalidated(() => {
      const style = document.getElementById('rttr-injected-styles');
      style?.remove();
      
      const tooltip = document.getElementById('rttr-global-tooltip');
      tooltip?.remove();
    });
  },
});
