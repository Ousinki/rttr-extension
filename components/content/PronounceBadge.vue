<template>
  <div
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { uiState, nearestLineRect } from '@/utils/content-state';

const isBottom = computed(() => {
  if (!uiState.pronounceBadge.rect) return false;
  const rect = nearestLineRect(uiState.pronounceBadge.rect);
  return rect.top < 100;
});

const badgeStyle = computed(() => {
  if (!uiState.pronounceBadge.rect) return {};
  const rect = nearestLineRect(uiState.pronounceBadge.rect);
  
  // Use viewport-relative coordinates directly (position: fixed)
  const x = rect.left + rect.width / 2;
  let y: number;

  if (isBottom.value) {
    y = rect.bottom + 6;
  } else {
    y = rect.top - 6;
  }

  return {
    left: `${x}px`,
    top: `${y}px`,
  };
});
</script>

<style scoped>
#rttr-pronounce-badge {
  position: fixed;
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
