<template>
  <Transition name="hud-fade">
    <div
      v-if="visible && activeNote"
      ref="hudRef"
      class="rttr-bili-hud-card"
      :style="{
        transform: `translate(${x}px, ${y}px)`,
        cursor: dragging ? 'grabbing' : 'default'
      }"
    >
      <!-- 🖐️ 顶部拖拽柄区域 -->
      <div class="hud-drag-handle" @mousedown="startDrag">
        <div class="drag-dots">
          <span></span><span></span><span></span>
        </div>
        <span class="hud-time-tag">💡 精读提示 [{{ formattedTime }}]</span>
        <button class="hud-close-btn" @click="closeHUD" title="隐藏悬浮窗">×</button>
      </div>

      <!-- 📝 讲义讲义内容区 (支持极速 Markdown 渲染) -->
      <div class="hud-body">
        <h4 class="hud-title">{{ activeNote.title }}</h4>
        <div class="hud-content notranslate" translate="no" v-html="renderedContent" @click="handleContentClick"></div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { biliState, biliActions } from '@/utils/bilibili-state';

const hudRef = ref<HTMLElement | null>(null);
const dragging = ref(false);

const visible = computed(() => biliState.studyActive && biliState.hudVisible && biliState.packageLoaded);
const activeNote = computed(() => biliState.activeNote);

// 格式化当前时间为 mm:ss
const formattedTime = computed(() => {
  if (!activeNote.value) return '00:00';
  const t = activeNote.value.timestamp;
  const m = Math.floor(t / 60).toString().padStart(2, '0');
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
});

// 轻量级 Markdown 语法向 HTML 的转换引擎 (极致防抖)
const renderedContent = computed(() => {
  if (!activeNote.value) return '';
  let md = activeNote.value.content;
  
  // 1. 保留换行转为 <br>
  md = md.replace(/\r?\n/g, '<br>');
  // 2. 加粗 **text** -> <strong>text</strong>
  md = md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // 3. 斜体 *text* -> <em>text</em>
  md = md.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // 4. 行内代码 `code` -> <code>
  md = md.replace(/`(.*?)`/g, '<code class="hud-inline-code">$1</code>');
  // 5. 无序列表项 - list -> • list
  md = md.replace(/^- (.*?)<br>/gm, '<div class="hud-list-item">• $1</div>');
  // 6. emoji 图标增强高亮
  md = md.replace(/(💡|📚|⭐|🗣️|👋|📝)/g, '<span class="hud-emoji">$1</span>');

  return md;
});

// --- 拖拽位移控制与高阶边界锚定 ---
const x = ref(0);
const y = ref(0);
let startX = 0;
let startY = 0;

// 同步状态中的位置
watch([x, y], ([newX, newY]) => {
  biliActions.updateHudPosition(newX, newY);
});

onMounted(() => {
  // 默认位置：放置在播放器右上角
  const container = document.querySelector('.bpx-player-container, .bili-video-player, .bilibili-player-video-wrap, #bilibili-player, #bilibiliPlayer') || document.body;
  const rect = container.getBoundingClientRect();
  x.value = rect.width > 360 ? rect.width - 340 : 20;
  y.value = 60;
});

const startDrag = (e: MouseEvent) => {
  if (e.button !== 0) return; // 仅左键拖拽
  dragging.value = true;
  startX = e.clientX - x.value;
  startY = e.clientY - y.value;
  
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
  e.preventDefault();
};

const onDrag = (e: MouseEvent) => {
  if (!dragging.value) return;
  let newX = e.clientX - startX;
  let newY = e.clientY - startY;

  // 边界约束：不能超出视频播放器的边界
  const container = document.querySelector('.bpx-player-container, .bili-video-player, .bilibili-player-video-wrap, #bilibili-player, #bilibiliPlayer') || document.body;
  const containerRect = container.getBoundingClientRect();
  const hudWidth = hudRef.value?.offsetWidth || 300;
  const hudHeight = hudRef.value?.offsetHeight || 180;

  // 留出 10px 边距
  newX = Math.max(10, Math.min(newX, containerRect.width - hudWidth - 10));
  newY = Math.max(10, Math.min(newY, containerRect.height - hudHeight - 50));

  x.value = newX;
  y.value = newY;
};

const stopDrag = () => {
  dragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

const closeHUD = () => {
  biliActions.setHudVisible(false);
};

// 交互词汇取词钩子
const handleContentClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  // 如果点击的是加粗重点词或者某个特定单词，可以手动提取并取词
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (text && /^[a-zA-Z\s'-]+$/.test(text) && !text.includes(' ') && text.length < 30) {
    const rect = target.getBoundingClientRect();
    const clickEvent = new CustomEvent('rttr-lookup-word', {
      detail: { word: text, rect, event: e }
    });
    window.dispatchEvent(clickEvent);
  }
};
</script>

<style>
/* 注入行内代码和列表项的全局 Shadows 样式 */
.hud-inline-code {
  background: rgba(255, 255, 255, 0.15) !important;
  color: #ffb300 !important;
  padding: 1px 4px !important;
  border-radius: 4px !important;
  font-family: Menlo, Monaco, Consolas, monospace !important;
  font-size: 12px !important;
}
.hud-list-item {
  margin: 4px 0 !important;
  padding-left: 8px !important;
  font-size: 13px !important;
  color: #d1d1d6 !important;
  line-height: 1.4 !important;
}
.hud-emoji {
  margin-right: 4px !important;
  vertical-align: middle !important;
}
</style>

<style scoped>
/* 🚀 磨砂透光玻璃态卡片 */
.rttr-bili-hud-card {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10010;
  width: 320px;
  max-height: 300px;
  background: rgba(20, 20, 22, 0.82);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  pointer-events: auto; /* 必须允许点击和拖拽 */
  transition: box-shadow 0.2s ease;
}

.rttr-bili-hud-card:hover {
  box-shadow: 0 16px 40px rgba(0, 174, 236, 0.18), 0 0 1px rgba(0, 174, 236, 0.4);
  border-color: rgba(0, 174, 236, 0.3);
}

/* 🖐️ 顶部拖动条 */
.hud-drag-handle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  cursor: grab;
}

.hud-drag-handle:active {
  cursor: grabbing;
}

.drag-dots {
  display: flex;
  gap: 3px;
  margin-right: 6px;
}

.drag-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
}

.hud-time-tag {
  font-size: 11px;
  font-weight: 700;
  color: #00aeec;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-grow: 1;
}

.hud-close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s ease;
}

.hud-close-btn:hover {
  color: #ff5252;
}

/* 📝 讲义区域 */
.hud-body {
  padding: 14px;
  overflow-y: auto;
  flex-grow: 1;
}

/* 自定义滚动条 */
.hud-body::-webkit-scrollbar {
  width: 4px;
}
.hud-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}
.hud-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 174, 236, 0.4);
}

.hud-title {
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 8px 0;
  border-left: 3px solid #00aeec;
  padding-left: 8px;
  line-height: 1.2;
}

.hud-content {
  font-size: 13.5px;
  line-height: 1.5;
  color: #e1e1e6;
  word-break: break-word;
}

.hud-content :deep(strong) {
  color: #00aeec;
  font-weight: 600;
}

/* HUD 显隐过渡效果 */
.hud-fade-enter-active,
.hud-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.hud-fade-enter-from,
.hud-fade-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-5px);
}
</style>
