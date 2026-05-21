<template>
  <div
    ref="badgeEl"
    id="rttr-pronounce-badge"
    :class="[
      { 'rttr-badge-visible': uiState.pronounceBadge.visible },
      isBottom ? 'pos-bottom' : 'pos-top'
    ]"
    :style="badgeStyle"
  >
    <div v-if="uiState.pronounceBadge.sylWord" class="rttr-syl-word">
      {{ uiState.pronounceBadge.sylWord }}
    </div>
    <div class="rttr-badge-content">
      <span v-if="uiState.pronounceBadge.isHTML" v-html="uiState.pronounceBadge.content"></span>
      <span v-else>{{ uiState.pronounceBadge.content }}</span>
    </div>
    <div v-if="uiState.pronounceBadge.translation" class="rttr-word-translation">
      {{ uiState.pronounceBadge.translation }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { uiState } from '@/utils/content-state';
import { checkFullscreen } from '@/utils/bilibili-state';

const badgeEl = ref<HTMLElement | null>(null);
const hostEl = ref<HTMLElement | null>(null);

onMounted(() => {
  if (badgeEl.value) {
    const rootNode = badgeEl.value.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      hostEl.value = rootNode.host as HTMLElement;
    }
  }
});

const isBottom = computed(() => {
  if (!uiState.pronounceBadge.rect) return false;
  const rect = uiState.pronounceBadge.rect;
  return rect.top < 100;
});

const badgeStyle = computed(() => {
  if (!uiState.pronounceBadge.rect) return {};
  const rect = uiState.pronounceBadge.rect;
  
  const host = hostEl.value;
  const isGlobalUi = !host || host.tagName === 'RTTR-UI-ROOT';
  
  let x: number;
  let y: number;

  if (isGlobalUi) {
    // 全局 UI 挂载在 body 底部，直接使用绝对文档坐标
    // 在全屏模式下，全局 UI 被移入全屏元素内，此时不需要加 scrollX/scrollY
    const isFullscreen = checkFullscreen();
    const scrollX = isFullscreen ? 0 : window.scrollX;
    const scrollY = isFullscreen ? 0 : window.scrollY;

    x = rect.left + scrollX + rect.width / 2;
    if (isBottom.value) {
      y = rect.bottom + scrollY + 6;
    } else {
      y = rect.top + scrollY - 6;
    }


  } else {
    // B 站精读 UI (RTTR-BILI-STUDY-UI) 挂载在播放器内部，需要使用相对于播放器容器的局部坐标
    let rootRect = host.getBoundingClientRect();
    const hasFullscreen = checkFullscreen();
    if (hasFullscreen) {
      rootRect = {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight
      } as DOMRect;
    }
    const rootTop = rootRect.top ?? (rootRect as any).y ?? 0;
    
    x = rect.left - rootRect.left + rect.width / 2;
    if (isBottom.value) {
      y = rect.bottom - rootTop + 6;
    } else {
      y = rect.top - rootTop - 6;
    }


  }

  return {
    left: `${x}px`,
    top: `${y}px`,
  };
});

</script>

<style scoped>
#rttr-pronounce-badge {
  position: absolute;
  z-index: 2147483647;
  background: rgba(28, 28, 30, 0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #7eb8ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  box-shadow: 0 3px 12px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.06);
  pointer-events: none;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.rttr-syl-word {
  color: #B56B45;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.rttr-badge-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.rttr-word-translation {
  margin-top: 2px;
  padding-top: 2px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 13px;
  font-weight: 400;
  font-family: system-ui, -apple-system, sans-serif;
  text-align: center;
}

#rttr-pronounce-badge.pos-top {
  transform: translate(-50%, -100%) scale(0.9);
}
#rttr-pronounce-badge.pos-top.rttr-badge-visible {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, -100%) scale(1);
}

#rttr-pronounce-badge.pos-bottom {
  transform: translate(-50%, 0) scale(0.9);
}
#rttr-pronounce-badge.pos-bottom.rttr-badge-visible {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0) scale(1);
}

#rttr-pronounce-badge::after {
  content: '';
  position: absolute;
  left: 50%;
  margin-left: -4px;
  border-width: 4px 4px 0 4px;
  border-style: solid;
}

#rttr-pronounce-badge.pos-top::after {
  bottom: -4px;
  border-color: rgba(28, 28, 30, 0.92) transparent transparent transparent;
}

#rttr-pronounce-badge.pos-bottom::after {
  top: -4px;
  border-width: 0 4px 4px 4px;
  border-color: transparent transparent rgba(28, 28, 30, 0.92) transparent;
}
</style>
