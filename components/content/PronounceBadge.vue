<template>
  <div
    id="rttr-pronounce-badge"
    :class="{ 'rttr-badge-visible': uiState.pronounceBadge.visible }"
    :style="badgeStyle"
  >
    <span v-if="uiState.pronounceBadge.isHTML" v-html="uiState.pronounceBadge.content"></span>
    <span v-else>{{ uiState.pronounceBadge.content }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { uiState, nearestLineRect } from '@/utils/content-state';

const badgeStyle = computed(() => {
  if (!uiState.pronounceBadge.rect) return {};
  const rect = nearestLineRect(uiState.pronounceBadge.rect);
  const x = rect.left + rect.width / 2;
  const y = rect.top + window.scrollY - 6;
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
  transform: translate(-50%, -100%) scale(0.9);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
}

#rttr-pronounce-badge.rttr-badge-visible {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, -100%) scale(1);
}

#rttr-pronounce-badge::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  margin-left: -4px;
  border-width: 4px 4px 0 4px;
  border-style: solid;
  border-color: rgba(28, 28, 30, 0.92) transparent transparent transparent;
}
</style>
