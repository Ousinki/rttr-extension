<template>
  <div ref="badgeEl">
    <div
      v-for="(line, index) in uiState.overlaySyllable.lines"
      :key="index"
      class="rttr-syllable-overlay"
      :class="{ 'rttr-overlay-visible': uiState.overlaySyllable.visible }"
      :style="getLineStyle(line.rect)"
    >
      {{ line.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
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

function getLineStyle(rect: DOMRect | null | any) {
  if (!rect) return {};
  
  const host = hostEl.value;
  const isGlobalUi = !host || host.tagName === 'RTTR-UI-ROOT';
  
  let x: number;
  let y: number;

  if (isGlobalUi) {
    const isFullscreen = checkFullscreen();
    const scrollX = isFullscreen ? 0 : window.scrollX;
    const scrollY = isFullscreen ? 0 : window.scrollY;

    x = rect.left + scrollX + rect.width / 2;
    y = rect.top + scrollY + rect.height / 2;


  } else {
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
    y = rect.top - rootTop + rect.height / 2;


  }

  return {
    left: `${x}px`,
    top: `${y}px`,
    fontSize: uiState.overlaySyllable.fontSize,
    fontWeight: uiState.overlaySyllable.fontWeight,
    fontFamily: uiState.overlaySyllable.fontFamily,
    color: uiState.overlaySyllable.color,
    letterSpacing: uiState.overlaySyllable.letterSpacing,
    fontStyle: uiState.overlaySyllable.fontStyle,
  };
}

</script>

<style scoped>
.rttr-syllable-overlay {
  position: absolute;
  z-index: 2147483646; /* below pronounce badge */
  background: #fdf012; /* Pure bright yellow, mimicking Mac native */
  border-radius: 0; /* Completely straight edges, no rounding */
  /* Added a subtle border without black drop shadow */
  box-shadow: 0 0 0 1px rgba(220, 200, 0, 0.8);
  pointer-events: none; 
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease, visibility 0.15s;
  white-space: nowrap;
  padding: 0 4px; /* Tight vertical padding, moderate horizontal padding */
  transform: translate(-50%, -50%);
}

.rttr-syllable-overlay.rttr-overlay-visible {
  opacity: 1;
  visibility: visible;
}
</style>
