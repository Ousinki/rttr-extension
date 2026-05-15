<template>
  <div>
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
import { uiState } from '@/utils/content-state';

function getLineStyle(rect: DOMRect | null) {
  if (!rect) return {};
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  return {
    left: `${centerX}px`,
    top: `${centerY}px`,
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
  position: fixed;
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
