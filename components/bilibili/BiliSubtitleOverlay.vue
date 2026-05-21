<template>
  <Transition name="fade">
    <div
      v-if="enabled && activeSub"
      class="rttr-bili-subtitle-container"
      :class="{ 'has-bg': hasBackground }"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <!-- 💡 讲义提示小灯泡 -->
      <div v-if="hasNote" class="rttr-note-indicator" @click="triggerNoteClick" title="查看本句精读讲义">
        <span class="pulse-ring"></span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
          <path d="M9 18h6"/>
          <path d="M10 22h4"/>
        </svg>
      </div>

      <!-- 英文富文本交互层 -->
      <div class="subtitle-english">
        <template v-for="(word, idx) in activeSub.wordsEn" :key="idx">
          <!-- 可交互的英文单词 -->
          <span
            v-if="word.isWord"
            class="subtitle-word rttr-word-interactive"
            :class="{ 'is-bold': word.bold }"
            :style="{ color: word.color }"
            @click.stop="handleWordClick($event, word.text)"
          >
            <!-- 上标 Ruby 注音效果 -->
            <ruby v-if="word.ruby">
              {{ word.text }}
              <rt>{{ word.ruby }}</rt>
            </ruby>
            <template v-else>{{ word.text }}</template>
          </span>
          <!-- 空格与标点符号 -->
          <span v-else class="subtitle-symbol">{{ word.text }}</span>
        </template>
      </div>

      <!-- 中文翻译层 -->
      <div v-if="activeSub.zh" class="subtitle-chinese">
        {{ activeSub.zh }}
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { biliState, biliActions } from '@/utils/bilibili-state';

// 属性控制
const enabled = computed(() => biliState.studyActive && biliState.customSubtitlesEnabled && biliState.packageLoaded);
const activeSub = computed(() => {
  if (biliState.activeIndex === -1) return null;
  return biliState.subtitles[biliState.activeIndex];
});

// 是否有背景板和精读讲义
const hasBackground = computed(() => true);
const hasNote = computed(() => !!biliState.activeNote);

// 鼠标悬停自动微暂停逻辑
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
const handleMouseEnter = () => {
  if (!biliState.packageLoaded) return;
  // 仅在视频播放时进行自动暂停，避免干扰已暂停状态
  if (biliState.isPlaying) {
    // 稍作防抖，避免指针划过误触
    hoverTimer = setTimeout(() => {
      const video = document.querySelector('video, bwp-video') as HTMLVideoElement;
      if (video && !video.paused) {
        video.pause();
      }
    }, 150);
  }
};

const handleMouseLeave = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  // 鼠标移出后，如果之前是因为悬停暂停的，可以恢复播放
  // 这里可以根据用户体验选择性开启，目前仅作为手动点击恢复
};

// 触发查词翻译
const handleWordClick = (event: MouseEvent, word: string) => {
  event.preventDefault();
  event.stopPropagation();
  
  // 寻找全局 RTTR 的单击发音/查词逻辑
  // 单词的 rect 可以通过触发事件的 target 元素计算出来
  const target = event.target as HTMLElement;
  const rect = target.getBoundingClientRect();
  
  // 向外抛出查词事件，或者直接模拟核心 extension 的点击处理
  const clickEvent = new CustomEvent('rttr-lookup-word', {
    detail: { word, rect, event }
  });
  window.dispatchEvent(clickEvent);
};

// 点击灯泡，打开精读讲义并自动暂停
const triggerNoteClick = () => {
  const video = document.querySelector('video, bwp-video') as HTMLVideoElement;
  if (video && !video.paused) {
    video.pause();
  }
  biliActions.setHudVisible(true);
};
</script>

<style scoped>
/* 🚀 磨砂玻璃态字幕包裹器 */
.rttr-bili-subtitle-container {
  position: absolute;
  bottom: 10%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  width: 90%;
  max-width: 780px;
  padding: 10px 24px;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  pointer-events: auto; /* 允许鼠标移入与单词交互 */
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border-radius: 12px;
  user-select: none;
}

/* 带有暗色磨砂质感的背景板，提高在任何视频背景下的阅读体验 */
.rttr-bili-subtitle-container.has-bg {
  background: rgba(13, 13, 15, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* 💡 灯泡提示按钮 */
.rttr-note-indicator {
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 179, 0, 0.9);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 179, 0, 0.4);
  transition: all 0.2s ease;
}

.rttr-note-indicator:hover {
  transform: translateY(-50%) scale(1.1);
  background: rgba(255, 193, 7, 1);
}

.pulse-ring {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid rgba(255, 179, 0, 0.5);
  animation: pulse 1.8s infinite ease-in-out;
  pointer-events: none;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* 英文排版 */
.subtitle-english {
  font-size: 20px;
  line-height: 1.4;
  font-weight: 500;
  color: #ffffff;
  margin-bottom: 6px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: baseline;
}

/* 中文排版 */
.subtitle-chinese {
  font-size: 15px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 400;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.5);
}

/* 可交互英文单词 */
.subtitle-word.rttr-word-interactive {
  display: inline-block;
  cursor: pointer;
  transition: all 0.15s ease;
  margin: 0 1.5px;
  border-radius: 4px;
  padding: 0 2px;
}

.subtitle-word.rttr-word-interactive:hover {
  background: rgba(0, 174, 236, 0.25);
  color: #00aeec !important;
  transform: translateY(-1px);
}

.subtitle-word.is-bold {
  font-weight: 700;
}

/* Ruby 上标样式 */
ruby {
  display: inline-flex;
  flex-direction: column-reverse;
  align-items: center;
  vertical-align: bottom;
}

rt {
  font-size: 10px;
  font-weight: 600;
  color: #00aeec;
  margin-bottom: -2px;
  padding: 0 2px;
  user-select: none;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

.subtitle-symbol {
  white-space: pre;
  color: inherit;
}

/* Vue 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
