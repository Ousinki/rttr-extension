<template>
  <div
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
import { computed, ref } from 'vue';
import { uiState, nearestLineRect } from '@/utils/content-state';


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
  if (!uiState.translationBadge.rect) return 'bottom';
  const targetRect = nearestLineRect(uiState.translationBadge.rect);
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
  if (!uiState.translationBadge.rect) return {};
  const targetRect = nearestLineRect(uiState.translationBadge.rect);
  // Use viewport-relative coordinates directly (position: fixed)
  const x = targetRect.left + targetRect.width / 2;
  let y: number;

  const pos = actualPosition.value;

  // Extra height when pronounce badge has syllable word (2 lines instead of 1)
  const pronounceExtraHeight = (uiState.pronounceBadge.visible && uiState.pronounceBadge.sylWord) ? 20 : 0;

  if (pos === 'top') {
    y = targetRect.top - 46 - pronounceExtraHeight;
    // If pronounce badge is also visible and flipped to top, shift further up
    if (uiState.pronounceBadge.visible && uiState.pronounceBadge.rect) {
      const pRect = nearestLineRect(uiState.pronounceBadge.rect);
      if (pRect.bottom > window.innerHeight - 80) {
        y -= 26;
      }
    }
  } else {
    y = targetRect.bottom + 12 + pronounceExtraHeight;
    // If pronounce badge is also visible and flipped to bottom, add extra
    // offset so the two badges don't overlap
    if (uiState.pronounceBadge.visible && uiState.pronounceBadge.rect) {
      const pRect = nearestLineRect(uiState.pronounceBadge.rect);
      if (pRect.top < 100) {
        y += 26;
      }
    }
  }

  return {
    left: `${x}px`,
    top: `${y}px`,
  };
});
</script>

<style scoped>
.rttr-translation-tooltip {
  position: fixed;
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
  transform: translate(-50%, 8px);
}
.rttr-translation-tooltip.pos-top.rttr-visible {
  transform: translate(-50%, 0);
}

.rttr-translation-tooltip.pos-bottom {
  transform: translate(-50%, -8px);
}
.rttr-translation-tooltip.pos-bottom.rttr-visible {
  transform: translate(-50%, 0);
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
