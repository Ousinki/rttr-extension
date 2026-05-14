<template>
  <div
    id="rttr-global-tooltip"
    :class="{ 'rttr-visible': uiState.tooltip.visible }"
    :style="tooltipStyle"
  >
    {{ uiState.tooltip.text }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { uiState, nearestLineRect } from '@/utils/content-state';

const tooltipStyle = computed(() => {
  if (!uiState.tooltip.rect) return {};
  const rect = nearestLineRect(uiState.tooltip.rect);
  const top = rect.top - 8;
  const centerX = rect.left + rect.width / 2;
  const left = centerX;

  const screenWidth = window.innerWidth;
  // Assume a max half-width of 140px based on max-width: 280px
  const maxHalfWidth = 140;
  const padding = 16;
  
  let shiftX = 0;
  if (centerX - maxHalfWidth < padding) {
    shiftX = padding - (centerX - maxHalfWidth);
  } else if (centerX + maxHalfWidth > screenWidth - padding) {
    shiftX = (screenWidth - padding) - (centerX + maxHalfWidth);
  }

  return {
    top: `${top}px`,
    left: `${left}px`,
    '--shift-x': `${shiftX}px`,
  };
});
</script>

<style scoped>
#rttr-global-tooltip {
  visibility: hidden;
  opacity: 0;
  transform: translate(calc(-50% + var(--shift-x, 0px)), calc(-100% + 4px)) scale(0.98);
  position: fixed;
  z-index: 2147483646;
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
  transform: translate(calc(-50% + var(--shift-x, 0px)), -100%) scale(1) !important;
}

#rttr-global-tooltip::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: calc(50% - var(--shift-x, 0px));
  margin-left: -5px;
  border-width: 5px 5px 0 5px;
  border-style: solid;
  border-color: rgba(28, 28, 30, 0.95) transparent transparent transparent;
}
</style>
