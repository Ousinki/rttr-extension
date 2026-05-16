<template>
  <div
    id="rttr-explain-panel"
    :class="{
      'rttr-ep-visible': uiState.explainPanel.visible,
      'rttr-ep-bottom': isBottom
    }"
    :style="panelStyle"
    ref="panelRef"
  >
    <div class="rttr-ep-header">
      <span class="rttr-ep-word">{{ uiState.explainPanel.word }}</span>
      <span class="rttr-ep-ipa" v-if="uiState.explainPanel.ipa">{{ uiState.explainPanel.ipa }}</span>
      <button class="rttr-ep-speak" aria-label="朗读" v-if="!uiState.explainPanel.loading" @click.stop="onSpeak">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
        </svg>
      </button>
      <div class="rttr-ep-close" @click.stop="uiActions.hideExplainPanel()">✕</div>
    </div>
    
    <div class="rttr-ep-divider"></div>
    
    <div class="rttr-ep-body rttr-ep-loading" v-if="uiState.explainPanel.loading">
      <div class="rttr-ep-spinner"></div>
      正在解析语境和固定搭配...
    </div>
    <div class="rttr-ep-body" v-else v-html="formattedExplanation"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { uiState, uiActions } from '@/utils/content-state';
import { speakText } from '@/utils/tts';
import { settingsStorage } from '@/utils/storage';

const panelRef = ref<HTMLElement | null>(null);
const panelStyle = ref({ top: '0px', left: '0px' });
const isBottom = ref(false);

const formattedExplanation = computed(() => {
  if (!uiState.explainPanel.explanation) return '';
  return uiState.explainPanel.explanation
    .replace(/【语境含义】[：:]?\s*(.*?)(?=\n【|$)/g, '<div class="rttr-ep-section"><div class="rttr-ep-label">语境含义</div><div class="rttr-ep-text">$1</div></div>')
    .replace(/【固定搭配】[：:]?\s*(.*?)(?=\n【|$)/g, '<div class="rttr-ep-section"><div class="rttr-ep-label">固定搭配</div><div class="rttr-ep-text">$1</div></div>')
    .replace(/\n/g, '<br/>');
});

const onSpeak = async () => {
  const currentSettings = await settingsStorage.getValue();
  speakText(uiState.explainPanel.word, currentSettings);
};

// Calculate position when visible or content changes
watch(() => [uiState.explainPanel.visible, uiState.explainPanel.loading], async ([visible]) => {
  if (visible && uiState.explainPanel.rect) {
    await nextTick();
    if (!panelRef.value) return;
    
    const rect = uiState.explainPanel.rect;
    const panelRect = panelRef.value.getBoundingClientRect();
    const padding = 12;
    
    let top = rect.top + window.scrollY - panelRect.height - padding;
    let left = rect.left + window.scrollX + (rect.width / 2) - (panelRect.width / 2);

    // If there's not enough space above, place it below the text
    if (top < window.scrollY + padding) {
      top = rect.bottom + window.scrollY + padding;
      isBottom.value = true;
    } else {
      isBottom.value = false;
    }

    if (left < window.scrollX + padding) left = window.scrollX + padding;
    if (left + panelRect.width > window.scrollX + window.innerWidth - padding) {
      left = window.scrollX + window.innerWidth - panelRect.width - padding;
    }

    panelStyle.value = {
      top: `${top}px`,
      left: `${left}px`,
    };
  }
});
</script>

<style scoped>
#rttr-explain-panel {
  position: absolute;
  z-index: 2147483646;
  width: 320px;
  background: #fdfaf5;
  border: 1px solid rgba(140, 120, 80, 0.2);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(90, 70, 40, 0.15), 0 2px 10px rgba(90, 70, 40, 0.05);
  font-family: system-ui, -apple-system, 'PingFang SC', sans-serif;
  opacity: 0;
  visibility: hidden;
  transform: translateY(8px) scale(0.98);
  transform-origin: bottom center;
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              visibility 0.2s;
  pointer-events: auto;
}

#rttr-explain-panel.rttr-ep-bottom {
  transform-origin: top center;
  transform: translateY(-8px) scale(0.98);
}

#rttr-explain-panel.rttr-ep-visible {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
}

.rttr-ep-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 8px;
}

.rttr-ep-word {
  font-size: 18px;
  font-weight: 700;
  color: #2c1e0f;
  letter-spacing: 0.01em;
}

.rttr-ep-speak {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(160, 130, 80, 0.12);
  border-radius: 6px;
  color: #8b6914;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
}

.rttr-ep-speak:hover {
  background: rgba(160, 130, 80, 0.25);
}

.rttr-ep-speak:active {
  transform: scale(0.92);
}

.rttr-ep-ipa {
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #7a6840;
  letter-spacing: 0.03em;
}

.rttr-ep-close {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #a09070;
  cursor: pointer;
  font-size: 14px;
  border-radius: 4px;
}

.rttr-ep-close:hover {
  background: rgba(0,0,0,0.04);
  color: #605040;
}

.rttr-ep-divider {
  height: 1px;
  background: rgba(140, 120, 80, 0.15);
  margin: 0 16px;
}

.rttr-ep-body {
  padding: 12px 16px 16px;
  font-size: 14px;
  line-height: 1.5;
  color: #4a3f35;
}

:deep(.rttr-ep-section) {
  margin-bottom: 8px;
}
:deep(.rttr-ep-section:last-child) {
  margin-bottom: 0;
}

:deep(.rttr-ep-label) {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: #8b6914;
  background: rgba(160, 130, 80, 0.12);
  padding: 2px 6px;
  border-radius: 4px;
  margin-bottom: 4px;
  letter-spacing: 0.02em;
}

:deep(.rttr-ep-text) {
  color: #3a2f25;
}

.rttr-ep-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #807060;
  padding: 20px 16px;
}

.rttr-ep-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(140, 120, 80, 0.2);
  border-top-color: #8b6914;
  border-radius: 50%;
  animation: rttr-spin 0.7s linear infinite;
}

@keyframes rttr-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-color-scheme: dark) {
  #rttr-explain-panel {
    background: linear-gradient(145deg, #2a2520 0%, #252018 50%, #201c15 100%);
    border-color: rgba(120, 100, 70, 0.3);
    color: #e0d5c5;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
  }
  .rttr-ep-word { color: #f0e8d8; }
  .rttr-ep-speak { background: rgba(200, 170, 100, 0.15); color: #c8a850; }
  .rttr-ep-speak:hover { background: rgba(200, 170, 100, 0.25); }
  .rttr-ep-ipa { color: #b0a080; }
  .rttr-ep-close { color: #807060; }
  .rttr-ep-close:hover { background: rgba(255,255,255,0.06); color: #c0b0a0; }
  .rttr-ep-divider { background: rgba(120, 100, 70, 0.25); }
  .rttr-ep-body { color: #d0c5b0; }
  .rttr-ep-body.rttr-ep-loading { color: #908070; }
  .rttr-ep-spinner { border-color: rgba(140, 120, 80, 0.2); border-top-color: #c8a850; }
  :deep(.rttr-ep-text) { color: #e0d5c5; }
}
</style>
