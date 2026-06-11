<template>
  <div
    id="rttr-context-menu"
    :class="{ 'rttr-cm-visible': uiState.contextMenu.visible }"
    :style="menuStyle"
    ref="menuRef"
  >
    <template v-for="(item, index) in uiState.contextMenu.items" :key="index">
      
      <!-- Divider -->
      <div v-if="item.type === 'divider' || item.label === 'DIVIDER'" class="rttr-cm-divider"></div>
      
      <!-- Header -->
      <div v-else-if="item.type === 'header'" 
           class="rttr-cm-header" 
           :class="{ clickable: !!item.onSpeakClick }"
           @click="item.onSpeakClick ? handleSpeakClick($event, item.onSpeakClick, index) : null"
           @mouseleave="item.onMouseLeave ? item.onMouseLeave() : null">
        
        <span v-if="!item.onSpeakClick">{{ item.label }}</span>
        
        <template v-else>
          <span class="rttr-cm-header-text">{{ item.label }}</span>
          <span class="rttr-cm-header-speak" :class="{ 'rttr-speaking': speakingIndex === index }">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
          </span>
        </template>
      </div>

      <!-- Info -->
      <div v-else-if="item.type === 'info'" class="rttr-cm-info">
        <span class="rttr-cm-info-text">{{ item.label }}</span>
      </div>

      <!-- Item -->
      <div v-else class="rttr-cm-item" @click="handleItemClick(item.onClick)">
        <span class="rttr-cm-icon" v-html="item.icon || ''"></span>
        <span>{{ item.label }}</span>
      </div>

    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { uiState, uiActions } from '@/utils/content-state';

const menuRef = ref<HTMLElement | null>(null);
const menuStyle = ref({ top: '0px', left: '0px' });
const speakingIndex = ref(-1);

watch(() => [uiState.contextMenu.visible, uiState.contextMenu.x, uiState.contextMenu.y], async ([visible, x, y]) => {
  if (visible) {
    await nextTick();
    if (!menuRef.value) return;
    
    const rect = menuRef.value.getBoundingClientRect();
    let finalX = x as number;
    let finalY = y as number;
    const padding = 10;
    
    if (finalX + rect.width > window.innerWidth) {
      finalX = window.innerWidth - rect.width - padding;
    }
    if (finalY + rect.height > window.innerHeight) {
      finalY = window.innerHeight - rect.height - padding;
    }
    
    menuStyle.value = {
      left: `${finalX}px`,
      top: `${finalY}px`,
    };
  } else {
    speakingIndex.value = -1;
  }
});

const handleItemClick = (onClick?: () => void) => {
  uiActions.hideContextMenu();
  if (onClick) onClick();
};

const handleSpeakClick = (e: MouseEvent, onSpeakClick: () => void, index: number) => {
  e.preventDefault();
  e.stopPropagation();
  speakingIndex.value = index;
  setTimeout(() => {
    if (speakingIndex.value === index) speakingIndex.value = -1;
  }, 2000);
  onSpeakClick();
};
</script>

<style scoped>
#rttr-context-menu {
  position: fixed;
  z-index: 2147483647;
  background: rgba(255, 255, 255, 0.85);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
  padding: 6px;
  font-family: system-ui, -apple-system, 'PingFang SC', sans-serif;
  min-width: 160px;
  opacity: 0;
  visibility: hidden;
  transform: scale(0.95);
  transform-origin: top left;
  transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.15s;
  pointer-events: auto;
}

#rttr-context-menu.rttr-cm-visible {
  opacity: 1;
  visibility: visible;
  transform: scale(1);
}

.rttr-cm-header {
  padding: 8px 12px 4px;
  font-size: 14px;
  font-weight: 600;
  color: #1c1c1e;
}

.rttr-cm-header.clickable {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.1s ease, color 0.1s ease;
  padding: 8px 12px;
  margin-bottom: 2px;
}

.rttr-cm-header.clickable:hover {
  background: #007aff;
  color: #ffffff;
}

.rttr-cm-header.clickable:hover .rttr-cm-header-speak {
  color: #ffffff;
}

.rttr-cm-header-text {
  word-break: break-all;
  max-width: 170px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rttr-cm-header-speak {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #007aff;
}

.rttr-speaking :deep(.rttr-wave1) {
  animation: rttr-wave-pulse 1.2s infinite both;
}
.rttr-speaking :deep(.rttr-wave2) {
  animation: rttr-wave-pulse 1.2s infinite 0.2s both;
}

@keyframes rttr-wave-pulse {
  0% { opacity: 0; }
  30% { opacity: 1; }
  70% { opacity: 0; }
  100% { opacity: 0; }
}

.rttr-cm-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: #2c2c2e;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.1s ease, color 0.1s ease;
}

.rttr-cm-item:hover {
  background: #007aff;
  color: #ffffff;
}

.rttr-cm-item:hover .rttr-cm-icon {
  color: #ffffff;
}

.rttr-cm-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
  margin: 6px;
}

.rttr-cm-info {
  display: flex;
  align-items: center;
  padding: 5px 12px;
  font-size: 12.5px;
  color: #6e6e73;
  user-select: text;
  -webkit-user-select: text;
  cursor: default;
  min-height: 24px;
  word-break: break-word;
}

.rttr-cm-info-text {
  font-family: system-ui, -apple-system, 'PingFang SC', sans-serif;
  line-height: 1.4;
}

.rttr-cm-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
