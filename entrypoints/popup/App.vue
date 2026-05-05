<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue';
import { settingsStorage, knownWordsStorage } from '@/utils/storage';
import type { RTTRSettings, KnownWord } from '@/utils/storage';

const settings = ref<RTTRSettings>({
  apiKey: '',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  annotationColor: '#4a90d9',
  enabled: true,
  ttsLanguage: 'en-US',
  ttsRate: 0.85,
  ttsVolume: 1.0,
  ttsVoiceURI: '',
});

const knownWordsCount = ref(0);
const knownWordsList = ref<KnownWord[]>([]);

onMounted(async () => {
  const savedSettings = await settingsStorage.getValue();
  settings.value = { ...settings.value, ...savedSettings };
  await loadKnownWords();
});

async function loadKnownWords() {
  const words = await knownWordsStorage.getValue();
  knownWordsList.value = words;
  knownWordsCount.value = words.length;
}

async function removeWord(wordStr: string) {
  const words = await knownWordsStorage.getValue();
  const updated = words.filter(w => w.word !== wordStr);
  await knownWordsStorage.setValue(updated);
  await loadKnownWords();
}

async function clearAllWords() {
  if (confirm('确定要清空所有已知词汇吗？')) {
    await knownWordsStorage.setValue([]);
    await loadKnownWords();
  }
}

watch(() => settings.value.enabled, async (newVal) => {
  await settingsStorage.setValue(settings.value);
});

function openOptions() {
  // 强制使用新标签页打开 Options，彻底杜绝内嵌小弹窗
  browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
}
</script>

<template>
  <div class="popup-container">
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <span class="logo-icon">文</span>
          <span class="logo-text">RTTR</span>
        </div>
        <span class="version">v0.1.0</span>
      </div>
      
      <button 
        class="toggle-btn" 
        :class="{ active: settings.enabled }"
        @click="settings.enabled = !settings.enabled"
        :title="settings.enabled ? 'Disable RTTR' : 'Enable RTTR'"
      >
        <span class="toggle-dot"></span>
      </button>
    </header>

    <main class="content">
      <div class="words-header">
        <span class="words-count">已掌握 {{ knownWordsCount }} 个词汇</span>
        <button class="clear-btn" @click="clearAllWords" v-if="knownWordsCount > 0">清空</button>
      </div>

      <div v-if="knownWordsCount === 0" class="empty-state">
        <div class="empty-icon">📚</div>
        <p class="empty-text">暂无已知词汇</p>
        <p class="empty-hint">划词翻译时扔掉的词汇会出现在这里</p>
      </div>

      <ul v-else class="word-list">
        <li v-for="w in knownWordsList" :key="w.word" class="word-item">
          <span class="word-text">{{ w.word }}</span>
          <span class="word-count">{{ w.dismissCount }}次</span>
          <button class="remove-btn" @click="removeWord(w.word)" title="移除">×</button>
        </li>
      </ul>
    </main>

    <footer class="footer">
      <button class="options-btn" @click="openOptions">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        进入高级设置
      </button>
    </footer>
  </div>
</template>

<style>
/* Reset body margin to remove white borders in extension popups */
body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}
</style>

<style scoped>
.popup-container {
  width: 320px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #ffffff;
  color: #171717;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: #ffffff;
  border-bottom: 1px solid #e5e5e5;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  background: #171717;
  color: #ffffff;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.logo-text {
  font-weight: 600;
  font-size: 15px;
  color: #171717;
  letter-spacing: 0.5px;
}

.version {
  font-size: 10px;
  color: #737373;
  padding: 2px 6px;
  background: #f5f5f5;
  border-radius: 4px;
  border: 1px solid #e5e5e5;
}

.toggle-btn {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: #e5e5e5;
  border: none;
  cursor: pointer;
  position: relative;
  transition: background 0.2s ease;
  padding: 0;
}

.toggle-btn.active {
  background: #171717;
}

.toggle-dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.toggle-btn.active .toggle-dot {
  transform: translateX(16px);
}

.content {
  padding: 16px;
}

.empty-state {
  text-align: center;
  padding: 32px 0;
}

.empty-icon {
  font-size: 24px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 13px;
  color: #171717;
  font-weight: 500;
  margin: 0;
}

.empty-hint {
  font-size: 11px;
  color: #737373;
  margin: 6px 0 0;
}

.words-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.words-count {
  font-size: 12px;
  font-weight: 500;
  color: #737373;
}

.clear-btn {
  padding: 4px 10px;
  background: transparent;
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.3);
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: rgba(220, 38, 38, 0.05);
}

.word-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 280px;
  overflow-y: auto;
}

.word-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.word-item:hover {
  background: #f5f5f5;
  border-color: #e5e5e5;
}

.word-text {
  flex: 1;
  font-size: 13px;
  color: #171717;
  font-weight: 500;
}

.word-count {
  font-size: 10px;
  color: #737373;
  margin-right: 12px;
  background: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #e5e5e5;
}

.remove-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #a3a3a3;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.15s ease;
  padding: 0;
}

.remove-btn:hover {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.05);
}

.footer {
  padding: 12px 16px;
  border-top: 1px solid #e5e5e5;
  background: #fafafa;
  display: flex;
  justify-content: center;
}

.options-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #737373;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s ease;
}

.options-btn:hover {
  color: #171717;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #e5e5e5;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #d4d4d4;
}
</style>
