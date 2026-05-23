<template>
  <div
    ref="badgeEl"
    class="rttr-translation-tooltip"
    :class="[
      { 'rttr-visible': uiState.translationBadge.visible },
      actualPosition === 'top' ? 'pos-top' : 'pos-bottom'
    ]"
    :style="badgeStyle"
  >
    <div v-if="parsedText" class="trans-content-col">
      <span class="trans-en">{{ parsedText.en }}</span>
      <span class="trans-zh">({{ parsedText.zh }})</span>
    </div>
    <strong v-else>{{ uiState.translationBadge.text }}</strong>

    <span class="engine-tag" v-if="uiState.translationBadge.showEngine">
      {{ safeEngine }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, nextTick } from 'vue';
import { uiState } from '@/utils/content-state';
import { checkFullscreen } from '@/utils/bilibili-state';

const badgeEl = ref<HTMLElement | null>(null);
const hostEl = ref<HTMLElement | null>(null);
const badgeWidth = ref(0);

onMounted(() => {
  if (badgeEl.value) {
    const rootNode = badgeEl.value.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      hostEl.value = rootNode.host as HTMLElement;
    }
  }
});

watch(
  () => [uiState.translationBadge.visible, uiState.translationBadge.text],
  async () => {
    if (uiState.translationBadge.visible) {
      await nextTick();
      if (badgeEl.value) {
        badgeWidth.value = badgeEl.value.offsetWidth;
      }
    } else {
      badgeWidth.value = 0;
    }
  },
  { immediate: true }
);

const safeEngine = computed(() => {
  const engine = uiState.translationBadge.engine;
  return engine ? engine.charAt(0).toUpperCase() + engine.slice(1) : '';
});

const parsedText = computed(() => {
  const match = uiState.translationBadge.text.match(/^(.*?)\s*[\(（](.*?)[\)）]$/);
  if (match) {
    return { en: match[1].trim(), zh: match[2].trim() };
  }
  return null;
});

const actualPosition = computed(() => {
  const targetRect = uiState.translationBadge.rect;
  if (!targetRect) return 'bottom';
  let pos = uiState.translationBadge.position || 'bottom';
  
  // Fallback to bottom if placed at top but there is not enough space
  if (pos === 'top' && targetRect.top < 100) {
    return 'bottom';
  }
  // Fallback to top if placed at bottom but too close to viewport bottom
  // (badge height ~46px + 12px offset = ~58px needed below the word)
  if (pos === 'bottom' && targetRect.bottom > window.innerHeight - 80) {
    return 'top';
  }
  return pos;
});

const badgeStyle = computed(() => {
  const targetRect = uiState.translationBadge.rect;
  if (!targetRect) return {};
  
  const host = hostEl.value;
  const isGlobalUi = !host || host.tagName === 'RTTR-UI-ROOT';
  
  let x: number;
  let y: number;

  // Determine if PronounceBadge is visible and where it is
  let pronouncePos = 'none';
  let pronounceExtraHeight = 0;
  if (uiState.pronounceBadge.visible && uiState.pronounceBadge.rect) {
    const pRect = uiState.pronounceBadge.rect;
    pronouncePos = pRect.top < 100 ? 'bottom' : 'top';
    pronounceExtraHeight = uiState.pronounceBadge.sylWord ? 20 : 0;
  }

  const pos = actualPosition.value;

  if (isGlobalUi) {
    // 全局 UI 直接采用文档绝对定位
    // 在全屏模式下，全局 UI 被移入全屏元素内，此时不需要加 scrollX/scrollY
    const isFullscreen = checkFullscreen();
    const scrollX = isFullscreen ? 0 : window.scrollX;
    const scrollY = isFullscreen ? 0 : window.scrollY;

    x = targetRect.left + scrollX + targetRect.width / 2;
    if (pos === 'top') {
      y = targetRect.top + scrollY - 12;
      if (pronouncePos === 'top') {
        y -= (26 + pronounceExtraHeight);
      }
    } else {
      y = targetRect.bottom + scrollY + 12;
      if (pronouncePos === 'bottom') {
        y += (26 + pronounceExtraHeight);
      }
    }


  } else {
    // B 站精读组件 (RTTR-BILI-STUDY-UI) 采用局部相对定位
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

    x = targetRect.left - rootRect.left + targetRect.width / 2;
    if (pos === 'top') {
      y = targetRect.top - rootTop - 12;
      if (pronouncePos === 'top') {
        y -= (26 + pronounceExtraHeight);
      }
    } else {
      y = targetRect.bottom - rootTop + 12;
      if (pronouncePos === 'bottom') {
        y += (26 + pronounceExtraHeight);
      }
    }


  }

  // Calculate shiftX to prevent overflow on left/right edges
  const viewportCenterX = targetRect.left + targetRect.width / 2;
  const screenWidth = window.innerWidth;
  const halfWidth = badgeWidth.value / 2;
  const padding = 16;
  let shiftX = 0;

  if (halfWidth > 0) {
    if (viewportCenterX - halfWidth < padding) {
      shiftX = padding - (viewportCenterX - halfWidth);
    } else if (viewportCenterX + halfWidth > screenWidth - padding) {
      shiftX = (screenWidth - padding) - (viewportCenterX + halfWidth);
    }
  }

  return {
    left: `${x}px`,
    top: `${y}px`,
    '--shift-x': `${shiftX}px`,
  };
});

</script>

<style scoped>
.rttr-translation-tooltip {
  position: absolute;
  background-color: #f0f0f0;
  color: #333333;
  border: 1px solid #dcdcdc;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 6px 10px;
  font-size: 14px;
  z-index: 2147483646;
  border-radius: 0px;
  pointer-events: none;
  white-space: pre-wrap;
  width: max-content;
  max-width: 300px;
  font-family: system-ui, -apple-system, sans-serif;
  
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: left;
  gap: 8px;
  
  opacity: 0;
  transition: opacity 0.2s ease-out, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.rttr-translation-tooltip.rttr-visible {
  opacity: 1;
}

.rttr-translation-tooltip.pos-top {
  transform: translate(calc(-50% + var(--shift-x, 0px)), calc(-100% + 8px));
}
.rttr-translation-tooltip.pos-top.rttr-visible {
  transform: translate(calc(-50% + var(--shift-x, 0px)), -100%);
}

.rttr-translation-tooltip.pos-bottom {
  transform: translate(calc(-50% + var(--shift-x, 0px)), -8px);
}
.rttr-translation-tooltip.pos-bottom.rttr-visible {
  transform: translate(calc(-50% + var(--shift-x, 0px)), 0);
}

.rttr-translation-tooltip .engine-tag {
  font-size: 10px;
  color: #888;
  border-left: 1px solid #ccc;
  padding-left: 8px;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
}

.rttr-translation-tooltip .trans-content-col {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
}

.rttr-translation-tooltip .trans-en {
  font-weight: 500;
  color: #555;
  font-size: 13px;
  line-height: 1.4;
}
.rttr-translation-tooltip .trans-zh {
  font-weight: 700;
  color: #1a1a1a;
  font-size: 14px;
  line-height: 1.4;
}
</style>
