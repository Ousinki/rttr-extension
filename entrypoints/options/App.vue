<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue';
import { settingsStorage } from '@/utils/storage';
import type { RTTRSettings } from '@/utils/storage';

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

const voices = ref<SpeechSynthesisVoice[]>([]);
const saved = ref(false);
const showApiKey = ref(false);
const testing = ref(false);
const testResult = ref<string>('');

const loadVoices = () => {
  const synth = window.speechSynthesis;
  voices.value = synth.getVoices().filter(v => v.lang.toLowerCase().includes('en'));
  if (voices.value.length === 0) voices.value = synth.getVoices();
  if (!settings.value.ttsVoiceURI && voices.value.length > 0) {
    const googleVoice = voices.value.find(v => v.name.includes('Google US English'));
    const defaultVoice = googleVoice || voices.value.find(v => v.default) || voices.value[0];
    settings.value.ttsVoiceURI = defaultVoice.voiceURI;
  }
};

onMounted(async () => {
  const savedSettings = await settingsStorage.getValue();
  settings.value = { ...settings.value, ...savedSettings };
  
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
});

async function saveSettings() {
  await settingsStorage.setValue(settings.value);
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}

function testTTS() {
  const synth = window.speechSynthesis;
  synth.cancel();
  
  const utterance = new SpeechSynthesisUtterance('Hello! This is a test of your RTTR text to speech settings.');
  utterance.lang = settings.value.ttsLanguage;
  utterance.rate = settings.value.ttsRate;
  utterance.volume = settings.value.ttsVolume;
  
  if (settings.value.ttsVoiceURI) {
    const selectedVoice = voices.value.find(v => v.voiceURI === settings.value.ttsVoiceURI);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
  }
  
  synth.speak(utterance);
}

async function testTranslation() {
  testing.value = true;
  testResult.value = '⏳ 正在测试...';

  try {
    await settingsStorage.setValue(settings.value);
    const response = await browser.runtime.sendMessage({
      type: 'TRANSLATE',
      text: 'The scientist addressed the fundamental hypothesis.',
    });

    if (response.success && response.results) {
      testResult.value = `✅ API 连接成功！`;
    } else {
      testResult.value = `❌ ${response.error || '未知错误'}`;
    }
  } catch (err: unknown) {
    testResult.value = `❌ ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    testing.value = false;
  }
}

watch(settings, () => {
  saveSettings();
}, { deep: true });
</script>

<template>
  <div class="options-container">
    <header class="header">
      <div class="logo">
        <span class="logo-icon">文</span>
        <span class="logo-text">RTTR 高级设置</span>
      </div>
    </header>

    <main class="content">
      <!-- API Settings -->
      <section class="settings-card">
        <h2>翻译 API 设置</h2>
        <p class="section-desc">配置 OpenAI 兼容的接口信息用于划词翻译。</p>

        <div class="form-group">
          <label class="label">API Key</label>
          <div class="input-with-toggle">
            <input :type="showApiKey ? 'text' : 'password'" v-model="settings.apiKey" placeholder="sk-..." class="input" />
            <button class="eye-btn" @click="showApiKey = !showApiKey">{{ showApiKey ? '🙈' : '👁️' }}</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group half">
            <label class="label">API 端点</label>
            <input type="text" v-model="settings.apiEndpoint" class="input" placeholder="https://api.openai.com/v1/chat/completions" />
          </div>
          <div class="form-group half">
            <label class="label">模型</label>
            <input type="text" v-model="settings.model" class="input" placeholder="gpt-4o-mini" />
          </div>
        </div>

        <div class="form-group">
          <label class="label">标注颜色 (Ruby Color)</label>
          <div class="color-row">
            <input type="color" v-model="settings.annotationColor" class="color-picker" />
            <span class="color-value">{{ settings.annotationColor }}</span>
            <ruby class="preview-ruby" :style="{ color: settings.annotationColor }">
              example
              <rt :style="{ color: settings.annotationColor }">示例</rt>
            </ruby>
          </div>
        </div>

        <div class="actions">
          <button class="test-btn" @click="testTranslation" :disabled="testing">{{ testing ? '⏳ 测试中...' : '🧪 测试 API' }}</button>
          <span v-if="testResult" class="test-result-inline" :class="{ error: testResult.startsWith('❌') }">{{ testResult }}</span>
        </div>
      </section>

      <!-- TTS Settings -->
      <section class="settings-card">
        <h2>语音合成 (TTS) 设置</h2>
        <p class="section-desc">配置鼠标点击单词时的朗读效果。</p>
        
        <div class="form-row">
          <div class="form-group half">
            <label class="label">发音人 (Voice)</label>
            <select v-model="settings.ttsVoiceURI" class="select">
              <option value="">(系统默认)</option>
              <option v-for="voice in voices" :key="voice.voiceURI" :value="voice.voiceURI">
                {{ voice.name }} ({{ voice.lang }})
              </option>
            </select>
          </div>
          <div class="form-group half">
            <label class="label">语言 (Language)</label>
            <input type="text" v-model="settings.ttsLanguage" class="input" placeholder="en-US" />
          </div>
        </div>

        <div class="form-group">
          <label class="label">语速 (Rate): {{ (settings.ttsRate ?? 0.85).toFixed(2) }}x</label>
          <input type="range" v-model.number="settings.ttsRate" min="0.1" max="2.0" step="0.05" class="slider" />
        </div>

        <div class="form-group">
          <label class="label">音量 (Volume): {{ Math.round((settings.ttsVolume ?? 1.0) * 100) }}%</label>
          <input type="range" v-model.number="settings.ttsVolume" min="0" max="1" step="0.05" class="slider" />
        </div>

        <div class="actions">
          <button class="test-btn" @click="testTTS">▶️ 测试发音</button>
          <span class="save-status" :class="{ visible: saved }">✓ 已自动保存</span>
        </div>
      </section>
      
    </main>
  </div>
</template>

<style>
/* Global reset for options page */
body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}
</style>

<style scoped>
.options-container {
  min-height: 100vh;
  background: #ffffff;
  color: #171717;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 60px;
}

.header {
  width: 100%;
  padding: 24px 40px;
  background: #ffffff;
  border-bottom: 1px solid #e5e5e5;
  margin-bottom: 40px;
  box-sizing: border-box;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  background: #171717;
  color: #ffffff;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
}

.logo-text {
  font-weight: 600;
  font-size: 18px;
  color: #171717;
  letter-spacing: 0.5px;
}

.content {
  width: 100%;
  max-width: 640px;
  padding: 0 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.settings-card {
  background: #ffffff;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

.settings-card h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #171717;
}

.section-desc {
  color: #737373;
  font-size: 13px;
  margin-bottom: 32px;
}

.form-group {
  margin-bottom: 24px;
}

.form-row {
  display: flex;
  gap: 16px;
}
.form-row .half {
  flex: 1;
}

.label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #737373;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.input, .select {
  width: 100%;
  padding: 10px 12px;
  background: #f5f5f5;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  color: #171717;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.select option {
  background: #ffffff;
  color: #171717;
}

.input:focus, .select:focus {
  border-color: #171717;
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(23, 23, 23, 0.1);
}

.input-with-toggle {
  position: relative;
}

.input-with-toggle .input {
  padding-right: 36px;
}

.eye-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #737373;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-picker {
  width: 32px;
  height: 32px;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  cursor: pointer;
  background: #f5f5f5;
  padding: 2px;
}

.color-value {
  font-size: 13px;
  color: #737373;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.slider {
  width: 100%;
  accent-color: #171717;
}

.actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #e5e5e5;
}

.test-btn {
  padding: 10px 24px;
  background: #171717;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.test-btn:hover {
  background: #333333;
}

.test-btn:active {
  transform: scale(0.98);
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-status {
  font-size: 13px;
  color: #737373;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.save-status.visible {
  opacity: 1;
}

.test-result-inline {
  font-size: 13px;
  color: #16a34a;
}
.test-result-inline.error {
  color: #dc2626;
}
</style>
