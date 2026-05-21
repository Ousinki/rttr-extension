<template>
  <Transition name="sidebar-slide">
    <div v-if="visible" class="rttr-bili-sidebar">
      <!-- 🪐 侧边栏头部 -->
      <div class="sidebar-header">
        <div class="header-logo">
          <svg class="logo-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#logo-grad)"/>
            <path d="M2 17L12 22L22 17" stroke="url(#logo-grad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="url(#logo-grad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="logo-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stop-color="#00aeec"/>
                <stop offset="1" stop-color="#c8a850"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="header-title">RTTR 精读助手</span>
        </div>
        <button class="close-btn" @click="closeSidebar" title="收起面板">✕</button>
      </div>

      <!-- 📑 选项卡 Tabs -->
      <div class="sidebar-tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          class="tab-btn" 
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.name }}</span>
        </button>
      </div>

      <!-- 📦 选项卡主体区 -->
      <div class="sidebar-body">
        <!-- 1. 📂 导入面板 -->
        <div v-if="activeTab === 'import'" class="tab-panel import-panel">
          <div 
            class="upload-dropzone"
            :class="{ dragging: isDraggingFile }"
            @dragover.prevent="isDraggingFile = true"
            @dragleave="isDraggingFile = false"
            @drop.prevent="handleFileDrop"
            @click="triggerFileSelect"
          >
            <input 
              type="file" 
              ref="fileInputRef" 
              style="display: none" 
              accept=".srt,.mdx,.md" 
              @change="handleFileSelect"
            />
            <div class="upload-icon-container">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div class="upload-title">拖拽文件或点击上传</div>
            <div class="upload-desc">支持标准字幕双语 .srt 或 Next.js 兼容 .mdx 学习讲义</div>
          </div>

          <!-- 已载入状态 -->
          <div v-if="packageLoaded" class="package-info-card">
            <h4 class="info-title">✨ 已载入学习包</h4>
            <div class="info-item">
              <span class="info-label">视频标题:</span>
              <span class="info-value text-ellipsis" :title="biliState.videoTitle">{{ biliState.videoTitle }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">精读标记:</span>
              <span class="info-value">{{ biliState.videoTitle ? biliState.bvid : '本地调试' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">字幕条数:</span>
              <span class="info-value highlight-num">{{ biliState.subtitles.length }} 句</span>
            </div>
            <div class="info-item">
              <span class="info-label">精读讲义:</span>
              <span class="info-value highlight-num">{{ biliState.notes.length }} 处</span>
            </div>
            <button class="clear-btn" @click="clearPackage">清空学习数据</button>
          </div>

          <!-- 使用说明 -->
          <div class="usage-guideline">
            <h5>📖 极速双语精读工作流</h5>
            <ol>
              <li>在 <strong>Bilingual Studio</strong> 目录导入或配好您的 <code>cc_dual.srt</code>。</li>
              <li>使用 Python 脚本 <code>srt_to_mdx.py</code> 生成一源双端的 <code>.mdx</code>。</li>
              <li>把生成的 <code>.mdx</code> 或 <code>.srt</code> 拖入此面板。</li>
              <li>视频播放时，光标悬浮字幕<strong>自动微暂停查词</strong>，点击灯泡查看悬浮讲义笔记！</li>
            </ol>
          </div>
        </div>

        <!-- 2. 💬 交互字幕流 -->
        <div v-if="activeTab === 'subtitles'" class="tab-panel subtitles-panel">
          <div v-if="!packageLoaded" class="empty-state">
            <p>请先在“导入”标签页中载入字幕数据</p>
          </div>
          <div v-else class="subtitles-list" ref="subListRef">
            <div 
              v-for="(sub, idx) in biliState.subtitles" 
              :key="idx"
              class="sub-item-card"
              :class="{ active: biliState.activeIndex === idx }"
              :ref="el => { if (biliState.activeIndex === idx) activeSubRef = el }"
              @click="seekTo(sub.start)"
            >
              <div class="sub-time-badge">{{ formatTime(sub.start) }}</div>
              <div class="sub-text-en notranslate" translate="no">{{ sub.en }}</div>
              <div class="sub-text-zh">{{ sub.zh }}</div>
            </div>
          </div>
        </div>

        <!-- 3. 📚 精读讲义库 -->
        <div v-if="activeTab === 'notes'" class="tab-panel notes-panel">
          <div v-if="!packageLoaded" class="empty-state">
            <p>请先载入含有 Markdown 精读讲义的 .mdx 学习包</p>
          </div>
          <div v-else-if="biliState.notes.length === 0" class="empty-state">
            <p>此学习包不包含任何时间戳讲义</p>
          </div>
          <div v-else class="notes-list">
            <div 
              v-for="(note, idx) in biliState.notes" 
              :key="idx"
              class="note-item-card"
              :class="{ active: biliState.activeNote?.timestamp === note.timestamp }"
              @click="seekTo(note.timestamp)"
            >
              <div class="note-item-header">
                <span class="note-time-badge">🕒 {{ formatTime(note.timestamp) }}</span>
                <span class="note-item-title text-ellipsis">{{ note.title }}</span>
              </div>
              <div class="note-item-preview text-ellipsis">{{ stripMarkdown(note.content) }}</div>
            </div>
          </div>
        </div>

        <!-- 4. ⚙️ 设置面板 -->
        <div v-if="activeTab === 'settings'" class="tab-panel settings-panel">
          <!-- 变速调节 -->
          <div class="settings-group">
            <div class="settings-group-header">
              <span class="group-title">⚡ 视频精细变速</span>
              <span class="group-value">{{ biliState.playbackRate.toFixed(2) }}x</span>
            </div>
            <div class="slider-container">
              <input 
                type="range" 
                min="0.5" 
                max="2.0" 
                step="0.05" 
                :value="biliState.playbackRate"
                @input="handleSpeedChange"
                class="settings-slider"
              />
              <div class="slider-ticks">
                <span @click="setSpeed(0.5)">0.5x</span>
                <span @click="setSpeed(1.0)">1.0x</span>
                <span @click="setSpeed(1.25)">1.25x</span>
                <span @click="setSpeed(1.5)">1.5x</span>
                <span @click="setSpeed(2.0)">2.0x</span>
              </div>
            </div>
          </div>

          <!-- A-B 循环与自动暂停控制 -->
          <div class="settings-group">
            <span class="group-title">🎯 沉浸式辅助功能</span>
            <div class="toggle-card">
              <div class="toggle-info">
                <div class="toggle-label">单句 A-B 循环播放</div>
                <div class="toggle-desc">开启后将反复播放当前这句字幕的时间区间</div>
              </div>
              <label class="switch-toggle">
                <input type="checkbox" :checked="biliState.loopActive" @change="toggleLoop" />
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="toggle-card">
              <div class="toggle-info">
                <div class="toggle-label">讲义自动暂停</div>
                <div class="toggle-desc">播放到有精读讲义的字幕时视频将自动暂停</div>
              </div>
              <label class="switch-toggle">
                <input type="checkbox" :checked="biliState.autoPause" @change="toggleAutoPause" />
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>

          <!-- 界面元素显隐 -->
          <div class="settings-group">
            <span class="group-title">🎨 界面元素开关</span>
            <div class="toggle-card">
              <div class="toggle-info">
                <div class="toggle-label">自定义精读富文本字幕</div>
                <div class="toggle-desc">接管B站自带字幕，显示带上标和重点色的字幕</div>
              </div>
              <label class="switch-toggle">
                <input type="checkbox" :checked="biliState.customSubtitlesEnabled" @change="toggleCustomSubtitles" />
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="toggle-card">
              <div class="toggle-info">
                <div class="toggle-label">Draggable HUD 讲义卡片</div>
                <div class="toggle-desc">在视频上方浮现当前句子的详细语法精读词条</div>
              </div>
              <label class="switch-toggle">
                <input type="checkbox" :checked="biliState.hudVisible" @change="toggleHudVisible" />
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { biliState, biliActions } from '@/utils/bilibili-state';
import { parseSrt, parseMdx } from '@/utils/bilibili-parser';
import { saveBiliPackage, deleteBiliPackage } from '@/utils/bilibili-storage';

// 声明 Emits
const emit = defineEmits<{
  (e: 'seek', time: number): void;
  (e: 'update-rate', rate: number): void;
}>();

const visible = computed(() => biliState.sidebarVisible);
const packageLoaded = computed(() => biliState.packageLoaded);

// Tabs 数据
const tabs = [
  { id: 'import', name: '导入', icon: '📂' },
  { id: 'subtitles', name: '字幕', icon: '💬' },
  { id: 'notes', name: '讲义', icon: '📚' },
  { id: 'settings', name: '设置', icon: '⚙️' }
];

const activeTab = ref('import');
const isDraggingFile = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

// 自动滚动字幕列表
const subListRef = ref<HTMLElement | null>(null);
const activeSubRef = ref<any>(null);

watch(() => biliState.activeIndex, async (newIdx) => {
  if (newIdx !== -1 && activeTab.value === 'subtitles') {
    await nextTick();
    if (activeSubRef.value && subListRef.value) {
      const cardEl = activeSubRef.value as HTMLElement;
      cardEl.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }
});

const closeSidebar = () => {
  biliState.sidebarVisible = false;
};

// --- 文件导入处理 ---
const triggerFileSelect = () => {
  fileInputRef.value?.click();
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
      if (biliState.bvid) {
        await saveBiliPackage(biliState.bvid, pkg);
      }
      activeTab.value = 'subtitles';
    } else if (fileName.endsWith('.mdx') || fileName.endsWith('.md')) {
      const pkg = parseMdx(text);
      if (pkg.subtitles.length === 0) {
        alert('警告：未能解析出 <T> 标签格式的字幕。请检查文件格式。');
      }
      biliActions.loadPackage(pkg);
      if (biliState.bvid) {
        await saveBiliPackage(biliState.bvid, pkg);
      }
      activeTab.value = 'subtitles';
    } else {
      alert('不支持的文件格式！目前只支持 .srt 或 .mdx/.md');
    }
  } catch (err) {
    console.error('解析学习包失败', err);
    alert('文件解析失败，请检查文件编码或内容格式！');
  }
};

const handleFileSelect = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target?.result as string;
    processFileContent(file.name, text);
  };
  reader.readAsText(file);
};

const handleFileDrop = (e: DragEvent) => {
  isDraggingFile.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target?.result as string;
    processFileContent(file.name, text);
  };
  reader.readAsText(file);
};

const clearPackage = async () => {
  if (confirm('确认清空当前学习包及本地缓存吗？')) {
    if (biliState.bvid) {
      await deleteBiliPackage(biliState.bvid);
    }
    biliActions.clearPackage();
    activeTab.value = 'import';
  }
};

// --- 播放器进度 Seek 转发 ---
const seekTo = (seconds: number) => {
  emit('seek', seconds);
};

// --- 设置项调节 ---
const handleSpeedChange = (e: Event) => {
  const rate = parseFloat((e.target as HTMLInputElement).value);
  biliActions.setPlaybackRate(rate, (r) => {
    emit('update-rate', r);
  });
};

const setSpeed = (rate: number) => {
  biliActions.setPlaybackRate(rate, (r) => {
    emit('update-rate', r);
  });
};

const toggleLoop = () => {
  if (biliState.loopActive) {
    biliActions.setLoopActive(false);
  } else {
    // 激活循环：将当前活动字幕的 start 和 end 作为循环点
    if (biliState.activeIndex !== -1) {
      const currentSub = biliState.subtitles[biliState.activeIndex];
      biliActions.setLoopActive(true, currentSub.start, currentSub.end);
    } else {
      alert('请在视频播放到有字幕的位置时再开启单句循环');
    }
  }
};

const toggleAutoPause = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked;
  biliActions.setAutoPause(checked);
};

const toggleCustomSubtitles = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked;
  biliActions.setCustomSubtitlesEnabled(checked);
};

const toggleHudVisible = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked;
  biliActions.setHudVisible(checked);
};

// --- 工具函数 ---
const formatTime = (t: number) => {
  const m = Math.floor(t / 60).toString().padStart(2, '0');
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const stripMarkdown = (md: string) => {
  return md
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^- /gm, '')
    .replace(/\r?\n/g, ' ')
    .trim();
};
</script>

<style scoped>
/* 🚀 侧边栏整体磨砂玻璃 */
.rttr-bili-sidebar {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10020;
  width: 360px;
  height: 100%;
  background: rgba(18, 18, 20, 0.85);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: -10px 0 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  pointer-events: auto; /* 必须允许交互 */
}

/* 🪐 头部 logo & 关闭按钮 */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.header-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  width: 24px;
  height: 24px;
}

.header-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: linear-gradient(135deg, #00aeec 0%, #c8a850 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ff5252;
}

/* 📑 Tabs 选择器 */
.sidebar-tabs {
  display: flex;
  background: rgba(255, 255, 255, 0.03);
  padding: 4px;
  margin: 12px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-btn.active {
  background: rgba(255, 255, 255, 0.1);
  color: #00aeec;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.tab-icon {
  font-size: 16px;
  margin-bottom: 2px;
}

.tab-label {
  font-size: 11px;
  font-weight: 600;
}

/* 📦 侧边栏内容滚动体 */
.sidebar-body {
  flex-grow: 1;
  overflow-y: auto;
  padding: 0 16px 20px 16px;
  display: flex;
  flex-direction: column;
}

/* 滚动条美化 */
.sidebar-body::-webkit-scrollbar {
  width: 4px;
}
.sidebar-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
.sidebar-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 174, 236, 0.4);
}

/* 1. 📂 导入面板样式 */
.import-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-dropzone {
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 32px 16px;
  text-align: center;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.25s ease;
}

.upload-dropzone:hover, .upload-dropzone.dragging {
  border-color: #00aeec;
  background: rgba(0, 174, 236, 0.05);
  box-shadow: 0 0 16px rgba(0, 174, 236, 0.1);
}

.upload-icon-container {
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 12px;
  transition: transform 0.2s ease;
}

.upload-dropzone:hover .upload-icon-container {
  transform: translateY(-2px);
  color: #00aeec;
}

.upload-title {
  font-size: 13.5px;
  font-weight: 700;
  margin-bottom: 4px;
}

.upload-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.4;
}

/* 载入状态卡片 */
.package-info-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px;
}

.info-title {
  font-size: 13px;
  font-weight: 700;
  margin: 0 0 10px 0;
  color: #00aeec;
}

.info-item {
  display: flex;
  font-size: 12.5px;
  margin-bottom: 6px;
}

.info-label {
  color: rgba(255, 255, 255, 0.5);
  width: 70px;
  flex-shrink: 0;
}

.info-value {
  color: #fff;
  flex-grow: 1;
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.highlight-num {
  font-weight: 600;
  color: #ffb300;
}

.clear-btn {
  margin-top: 12px;
  width: 100%;
  background: rgba(255, 82, 82, 0.12);
  border: 1px solid rgba(255, 82, 82, 0.3);
  color: #ff5252;
  padding: 8px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: rgba(255, 82, 82, 0.25);
}

.usage-guideline {
  background: rgba(200, 168, 80, 0.05);
  border: 1px solid rgba(200, 168, 80, 0.15);
  border-radius: 10px;
  padding: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.usage-guideline h5 {
  font-size: 12.5px;
  margin: 0 0 6px 0;
  color: #c8a850;
}

.usage-guideline ol {
  margin: 0;
  padding-left: 16px;
  font-size: 11.5px;
  line-height: 1.5;
}

.usage-guideline li {
  margin-bottom: 4px;
}

/* 2. 💬 字幕流样式 */
.subtitles-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.subtitles-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.sub-item-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sub-item-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(0, 174, 236, 0.3);
}

.sub-item-card.active {
  background: rgba(0, 174, 236, 0.08);
  border-color: #00aeec;
  box-shadow: 0 2px 12px rgba(0, 174, 236, 0.15);
}

.sub-time-badge {
  font-size: 10px;
  font-weight: 700;
  color: #00aeec;
  margin-bottom: 4px;
}

.sub-text-en {
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.35;
  color: #fff;
  margin-bottom: 2px;
}

.sub-text-zh {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.3;
}

/* 3. 📚 精读讲义库样式 */
.notes-panel {
  display: flex;
  flex-direction: column;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.note-item-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.note-item-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(200, 168, 80, 0.3);
}

.note-item-card.active {
  background: rgba(200, 168, 80, 0.08);
  border-color: #c8a850;
  box-shadow: 0 2px 12px rgba(200, 168, 80, 0.15);
}

.note-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.note-time-badge {
  font-size: 10.5px;
  font-weight: 700;
  color: #c8a850;
  background: rgba(200, 168, 80, 0.12);
  padding: 2px 6px;
  border-radius: 4px;
}

.note-item-title {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-grow: 1;
}

.note-item-preview {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.4;
}

/* 4. ⚙️ 设置面板样式 */
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.group-title {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.group-value {
  font-size: 13px;
  font-weight: 700;
  color: #00aeec;
}

/* 变速滑块 */
.slider-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.15);
  outline: none;
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #00aeec;
  cursor: pointer;
  box-shadow: 0 0 6px rgba(0, 174, 236, 0.4);
  transition: transform 0.1s;
}

.settings-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.slider-ticks {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.slider-ticks span {
  cursor: pointer;
  padding: 2px 4px;
}

.slider-ticks span:hover {
  color: #00aeec;
}

/* 开关选项卡卡片 */
.toggle-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-grow: 1;
}

.toggle-label {
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
}

.toggle-desc {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.3;
}

/* iOS 风格 Switch 开关 */
.switch-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}

.switch-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.15);
  transition: .2s;
  border-radius: 20px;
}

.switch-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: .2s;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

input:checked + .switch-slider {
  background-color: #00aeec;
}

input:checked + .switch-slider:before {
  transform: translateX(16px);
}

/* 空白占位 */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-grow: 1;
  padding: 40px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.35);
  font-size: 12.5px;
}

/* 过渡动画 */
.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(100%);
}
</style>
