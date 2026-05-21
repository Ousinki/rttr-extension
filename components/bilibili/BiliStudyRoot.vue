<template>
  <div class="rttr-bili-study-root-wrapper">
    <!-- 1. 自定义富文本字幕层 Overlay -->
    <BiliSubtitleOverlay />

    <!-- 2. Draggable 磨砂玻璃态 HUD 讲义卡片 -->
    <BiliStudyHUD />

    <!-- 3. 全局拖拽文件导入玻璃遮罩层 -->
    <div 
      v-if="isDraggingFile" 
      class="rttr-bili-drag-overlay"
      @dragover.prevent
      @dragleave="handleDragLeave"
      @drop.prevent="handleFileDrop"
    >
      <div class="rttr-bili-drag-zone">
        <div class="rttr-bili-drag-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <h3>释放鼠标以导入 RTTR 双语精读学习包</h3>
        <p>支持标准双语字幕 .srt 或 Next.js 兼容 .mdx/.md 学习讲义</p>
      </div>
    </div>

    <!-- 4. 精致滑动 Toast 提示框 -->
    <Transition name="slide-down">
      <div v-if="toastVisible" class="rttr-bili-toast">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toast-success-icon">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>{{ toastText }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import BiliSubtitleOverlay from './BiliSubtitleOverlay.vue';
import BiliStudyHUD from './BiliStudyHUD.vue';
import { biliState, biliActions } from '@/utils/bilibili-state';
import { getBiliPackage, saveBiliPackage } from '@/utils/bilibili-storage';
import { parseSrt, parseMdx } from '@/utils/bilibili-parser';

const videoEl = ref<HTMLVideoElement | null>(null);
let videoCheckInterval: ReturnType<typeof setInterval> | null = null;
let rafId: number | null = null;

// UI 拖拽与提示状态
const isDraggingFile = ref(false);
const toastText = ref('');
const toastVisible = ref(false);

const showToast = (text: string) => {
  toastText.value = text;
  toastVisible.value = true;
  setTimeout(() => {
    toastVisible.value = false;
  }, 4000);
};

// --- 查找并绑定 B 站 HTML5 视频元素 ---
const findAndBindVideo = () => {
  const video = document.querySelector('.bpx-player-container video, #bilibili-player video, .bili-video-player video, .bilibili-player-video-wrap video, video') as HTMLVideoElement;
  if (!video) return;

  if (videoEl.value === video) return; // 已经绑定

  // 清除旧事件
  unbindVideoEvents();

  videoEl.value = video;
  
  // 绑定原生视频事件以便同步 isPlaying 状态
  video.addEventListener('play', handleVideoPlay);
  video.addEventListener('pause', handleVideoPause);
  video.addEventListener('ratechange', handleVideoRateChange);

  // 初始化状态
  biliState.isPlaying = !video.paused;
  biliState.playbackRate = video.playbackRate;

  // 尝试自动载入 IndexedDB 缓存的学习包
  loadCachedPackage();
};

const unbindVideoEvents = () => {
  if (videoEl.value) {
    videoEl.value.removeEventListener('play', handleVideoPlay);
    videoEl.value.removeEventListener('pause', handleVideoPause);
    videoEl.value.removeEventListener('ratechange', handleVideoRateChange);
    videoEl.value = null;
  }
};

const handleVideoPlay = () => {
  biliState.isPlaying = true;
};

const handleVideoPause = () => {
  biliState.isPlaying = false;
};

const handleVideoRateChange = () => {
  if (videoEl.value) {
    biliState.playbackRate = videoEl.value.playbackRate;
  }
};

// --- 加载 IndexedDB 缓存 ---
const loadCachedPackage = async () => {
  const bvidMatch = window.location.href.match(/\/video\/(BV[a-zA-Z0-9]+)/);
  const bvid = bvidMatch ? bvidMatch[1] : '';
  
  if (bvid) {
    const videoTitleEl = document.querySelector('.video-title, #viewbox_report h1');
    const title = videoTitleEl ? videoTitleEl.textContent?.trim() || 'B站视频' : 'B站视频';
    
    await biliActions.initVideo(bvid, title);

    const pkg = await getBiliPackage(bvid);
    if (pkg) {
      biliActions.loadPackage(pkg);
      console.log('[RTTR BiliStudy] 成功自动重载本地精读缓存数据包:', pkg.title);
    }
  }
};

// --- 拖拽交互逻辑 ---
const handleDragOver = (e: DragEvent) => {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    isDraggingFile.value = true;
  }
};

const handleDragLeave = () => {
  isDraggingFile.value = false;
};

const handleFileDrop = (e: DragEvent) => {
  e.preventDefault();
  isDraggingFile.value = false;
  
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const text = event.target?.result as string;
    await processFileContent(file.name, text);
  };
  reader.readAsText(file);
};

const processFileContent = async (fileName: string, text: string) => {
  try {
    if (fileName.endsWith('.srt')) {
      const entries = parseSrt(text);
      const pkg = {
        title: fileName.replace('.srt', ''),
        subtitles: entries,
        notes: []
      };
      biliActions.loadPackage(pkg);
      biliActions.setStudyActive(true); // 自动开启双语精读效果
      if (biliState.bvid) {
        await saveBiliPackage(biliState.bvid, pkg);
      }
      showToast(`成功载入双语字幕: ${fileName.replace('.srt', '')}`);
    } else if (fileName.endsWith('.mdx') || fileName.endsWith('.md')) {
      const pkg = parseMdx(text);
      if (pkg.subtitles.length === 0) {
        showToast('警告：未能解析出 <T> 标签格式的字幕，请检查文件。');
      }
      biliActions.loadPackage(pkg);
      biliActions.setStudyActive(true); // 自动开启双语精读效果
      if (biliState.bvid) {
        await saveBiliPackage(biliState.bvid, pkg);
      }
      showToast(`成功载入双语精读包: ${pkg.title || fileName}`);
    } else {
      showToast('不支持的文件格式！目前只支持 .srt 或 .mdx/.md');
    }
  } catch (err) {
    console.error('解析学习包失败', err);
    showToast('文件解析失败，请检查编码或格式！');
  }
};

// --- 高精度视频时间更新 Raf 循环 ---
const startTickLoop = () => {
  const tick = () => {
    if (videoEl.value) {
      const video = videoEl.value;
      biliState.isPlaying = !video.paused;

      const needsSeek = biliActions.updateTime(video.currentTime, () => {
        video.pause();
        biliState.isPlaying = false;
      });

      if (needsSeek && biliState.loopActive) {
        video.currentTime = biliState.loopStart;
      }
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
};

const stopTickLoop = () => {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

// --- 生命周期钩子 ---
onMounted(() => {
  findAndBindVideo();
  videoCheckInterval = setInterval(findAndBindVideo, 1000);
  startTickLoop();

  // 绑定全局拖拽事件
  window.addEventListener('dragover', handleDragOver);
});

onUnmounted(() => {
  unbindVideoEvents();
  stopTickLoop();
  if (videoCheckInterval) {
    clearInterval(videoCheckInterval);
  }
  
  // 清理全局拖拽事件
  window.removeEventListener('dragover', handleDragOver);
});
</script>

<style scoped>
/* 🚀 顶层挂载容器：完全绝对定位覆盖 B 站播放器 */
.rttr-bili-study-root-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 穿透，避免遮挡原生视频控制栏 */
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}

/* 📂 拖拽遮罩层样式 */
.rttr-bili-drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.65); /* 暗色半透明遮罩 */
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
  pointer-events: auto; /* 必须允许鼠标穿透以接收 Drop 事件 */
  animation: fadeIn 0.25s ease-out;
}

.rttr-bili-drag-zone {
  border: 2px dashed rgba(255, 255, 255, 0.35);
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  max-width: 500px;
  width: 90%;
  color: #f8fafc;
  background: rgba(30, 41, 59, 0.5);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.rttr-bili-drag-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #38bdf8; /* 天蓝色 */
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.15);
  animation: pulse 2s infinite;
}

.rttr-bili-drag-zone h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #fff;
  letter-spacing: 0.5px;
}

.rttr-bili-drag-zone p {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
}

/* 🍞 Toast 提示框样式 */
.rttr-bili-toast {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30000;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.25);
  padding: 10px 20px;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  pointer-events: none;
}

.toast-success-icon {
  color: #34d399; /* 翡翠绿 */
  flex-shrink: 0;
}

/* 🎬 动效关键帧 */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes pulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.4); }
  70% { transform: scale(1.04); box-shadow: 0 0 0 10px rgba(56, 189, 248, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
}

/* Slide Down 动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translate(-50%, -24px);
  opacity: 0;
}
</style>
