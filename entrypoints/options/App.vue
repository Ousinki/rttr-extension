<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue';
import { settingsStorage } from '@/utils/storage';
import type { RTTRSettings } from '@/utils/storage';

const settings = ref<RTTRSettings>({
  apiKey: '',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',

  enabled: true,
  ttsLanguage: 'en-US',
  ttsRate: 0.85,
  ttsVolume: 1.0,
  ttsVoiceURI: '',
  selectionPronounceMode: 'auto',
});

const voices = ref<SpeechSynthesisVoice[]>([]);
const saved = ref(false);
const showApiKey = ref(false);
const testing = ref(false);
const testResult = ref<string>('');
const testingTTS = ref(false);
const testResultTTS = ref<string>('');

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

watch(() => settings.value.translationEngine, (newVal, oldVal) => {
  if (oldVal === 'none' && newVal !== 'none') {
    settings.value.translationPosition = 'bottom';
  }
  saveSettings();
});

async function saveSettings() {
  await settingsStorage.setValue(settings.value);
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}

function testTTS() {
  testingTTS.value = true;
  testResultTTS.value = '';
  
  const synth = window.speechSynthesis;
  synth.cancel();
  
  const utterance = new SpeechSynthesisUtterance("Testing pronunciation. The quick brown fox jumps over the lazy dog.");
  
  utterance.onend = () => {
    testingTTS.value = false;
    testResultTTS.value = '✅ 测试成功';
    setTimeout(() => { testResultTTS.value = ''; }, 3000);
  };
  
  utterance.onerror = (e) => {
    testingTTS.value = false;
    testResultTTS.value = `❌ 测试失败: ${e.error}`;
  };

  if (settings.value.ttsLanguage) {
    utterance.lang = settings.value.ttsLanguage;
  }
  if (settings.value.ttsRate) {
    utterance.rate = settings.value.ttsRate;
  }
  if (settings.value.ttsVolume !== undefined) {
    utterance.volume = settings.value.ttsVolume;
  }
  
  const voiceURI = settings.value.ttsVoiceURI;
  if (voiceURI) {
    const selectedVoice = voices.value.find(v => v.voiceURI === voiceURI);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
  }
  
  synth.speak(utterance);
}

// ─── Shortcut Recorder Logic ───
const isRecordingShortcut = ref(false);

function formatShortcutDisplay(shortcutStr: string | undefined): string {
  if (!shortcutStr) return '未启用';
  return shortcutStr.split('+').map(part => {
    if (part === 'Alt') return '⌥ Option';
    if (part === 'Meta') return '⌘ Command';
    if (part === 'Control') return '⌃ Control';
    if (part === 'Shift') return '⇧ Shift';
    if (part.startsWith('Key')) return part.replace('Key', '');
    if (part.startsWith('Digit')) return part.replace('Digit', '');
    return part;
  }).join(' + ');
}

function getShortcutKeys(shortcutStr: string | undefined): string[] {
  if (!shortcutStr) return [];
  return shortcutStr.split('+').map(part => {
    if (part === 'Alt') return '⌥';
    if (part === 'Meta') return '⌘';
    if (part === 'Control') return '⌃';
    if (part === 'Shift') return '⇧';
    if (part.startsWith('Key')) return part.replace('Key', '');
    if (part.startsWith('Digit')) return part.replace('Digit', '');
    return part;
  });
}

const shortcutWarning = computed(() => {
  const shortcut = settings.value.paragraphShortcut;
  if (!shortcut) return '';
  
  const systemConflicts = [
    // Meta (Mac) browser conflicts
    'Meta+KeyC', 'Meta+KeyV', 'Meta+KeyX', 'Meta+KeyZ', 'Meta+KeyA',
    'Meta+KeyT', 'Meta+KeyW', 'Meta+KeyN', 'Meta+Shift+KeyT', 'Meta+Shift+KeyW',
    'Meta+KeyR', 'Meta+Shift+KeyR',
    'Meta+KeyF', 'Meta+KeyG',
    'Meta+KeyS', 'Meta+KeyP',
    'Meta+Space',
    
    // Control (Win/Linux) browser conflicts
    'Control+KeyC', 'Control+KeyV', 'Control+KeyX', 'Control+KeyZ', 'Control+KeyA',
    'Control+KeyT', 'Control+KeyW', 'Control+KeyN', 'Control+Shift+KeyT', 'Control+Shift+KeyW',
    'Control+KeyR', 'Control+Shift+KeyR',
    'Control+KeyF', 'Control+KeyG',
    'Control+KeyS', 'Control+KeyP',
    
    // Global conflicts
    'Alt+F4',
    'Alt+ArrowLeft', 'Alt+ArrowRight'
  ];
  
  if (systemConflicts.includes(shortcut)) {
    return '此组合键是系统或浏览器的保留快捷键，可能会冲突导致无法触发。';
  }
  return '';
});

function startRecordingShortcut(e?: MouseEvent) {
  if (e) {
    e.stopPropagation();
  }
  
  if (isRecordingShortcut.value) {
    stopRecordingShortcut();
    return;
  }
  
  isRecordingShortcut.value = true;
  
  const handleKeydown = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Support Escape or Backspace to clear shortcut
    if (e.code === 'Escape' || e.code === 'Backspace') {
      settings.value.paragraphShortcut = '';
      saveSettings();
      stopRecordingShortcut();
      return;
    }
    
    const modifiers = [];
    if (e.ctrlKey) modifiers.push('Control');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.metaKey) modifiers.push('Meta');
    
    // Ignore if only modifier is pressed
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    
    // Require at least one valid modifier (Ctrl, Alt, Meta) to prevent breaking standard typing
    const hasValidModifier = e.ctrlKey || e.altKey || e.metaKey;
    if (!hasValidModifier && !e.code.startsWith('F')) {
      // Must have a valid modifier, OR be a function key (F1-F12)
      return; 
    }
    
    const key = e.code;
    const newShortcut = [...modifiers, key].join('+');
    
    settings.value.paragraphShortcut = newShortcut;
    saveSettings();
    stopRecordingShortcut();
  };
  
  const handleClickOutside = () => {
    stopRecordingShortcut();
  };
  
  // Attach at capturing phase to intercept before anything else
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('click', handleClickOutside, true);
  
  // Store the handler on window to remove it later
  (window as any).__rttrShortcutHandler = handleKeydown;
  (window as any).__rttrClickHandler = handleClickOutside;
}

function stopRecordingShortcut() {
  isRecordingShortcut.value = false;
  if ((window as any).__rttrShortcutHandler) {
    document.removeEventListener('keydown', (window as any).__rttrShortcutHandler, true);
    delete (window as any).__rttrShortcutHandler;
  }
  if ((window as any).__rttrClickHandler) {
    document.removeEventListener('click', (window as any).__rttrClickHandler, true);
    delete (window as any).__rttrClickHandler;
  }
}


async function testTranslation() {
  testing.value = true;
  testResult.value = '';

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
        <img class="logo-icon" src="/icon.svg" alt="RTTR Logo" />
        <span class="logo-text">RTTR 高级设置</span>
      </div>
    </header>

    <main class="content">
      <!-- API Settings -->
      <section class="settings-card">
        <h2>翻译 API 设置</h2>
        <p class="section-desc">配置 OpenAI 兼容的接口信息用于长句/段落的 AI 划词翻译。</p>

        <div class="form-group">
          <label class="label">AI 长句翻译 API Key (OpenAI 格式)</label>
          <div class="input-with-toggle">
            <input :type="showApiKey ? 'text' : 'password'" v-model="settings.apiKey" placeholder="sk-..." class="input" />
            <button class="eye-btn" @click="showApiKey = !showApiKey" aria-label="Toggle visibility">
              <svg v-if="showApiKey" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
            </button>
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

        <div class="actions">
          <button class="test-btn" @click="testTranslation" :disabled="testing" :class="{ 'is-loading': testing }">
            <svg v-if="testing" class="spinner" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            {{ testing ? '测试中...' : '测试 API' }}
          </button>
          <span v-if="testResult" class="test-result-inline" :class="{ error: testResult.includes('失败') || testResult.includes('错误') }">
            <svg v-if="testResult.includes('成功')" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            {{ testResult.replace(/❌|✅|⏳|正在/g, '').trim() }}
          </span>
        </div>
      </section>

      <!-- Translation Tooltip Preview -->
      <section class="settings-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h2 style="margin: 0;">翻译悬浮窗与引擎</h2>
          <div style="display: flex; align-items: center; gap: 12px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #555; cursor: pointer;" :style="{ opacity: settings.translationEngine === 'none' ? 0.5 : 1, pointerEvents: settings.translationEngine === 'none' ? 'none' : 'auto' }">
              <input type="checkbox" v-model="settings.showTranslationEngine" :disabled="settings.translationEngine === 'none'" />
              显示引擎尾标
            </label>
            <select v-model="settings.translationEngine" class="select" style="width: auto; padding: 6px 12px; font-size: 13px;">
              <option value="none">不启用</option>
              <option value="google">Google Translate</option>
              <option value="deepl">DeepL</option>
              <option value="bing">Bing Microsoft</option>
            </select>
          </div>
        </div>
        <p class="section-desc">直角灰底设计。点击下方卡片选择翻译框的默认弹出位置。</p>
        
        <div class="animation-previews" style="grid-template-columns: 1fr 1fr;">
          <!-- 位置 1：下方 -->
          <div class="preview-box" :class="{ active: settings.translationEngine !== 'none' && settings.translationPosition === 'bottom' }" @click="settings.translationEngine !== 'none' && (settings.translationPosition = 'bottom')">
            <div class="preview-title">显示于文字下方</div>
            <div class="anim-container anim-translation" style="height: 140px;">
              <div class="anim-text" style="padding-top: 40px;">
                <span class="trans-target-word">
                  <span style="color: #007aff;">hypothesis</span>
                  <!-- 黑色音标悬浮窗 (模拟) -->
                  <div class="anim-badge-black trans-ipa-badge" :style="{ top: '-24px', opacity: settings.showSingleClickIPA ? '' : '0 !important', transition: 'opacity 0.2s ease' }">
                    / haɪˈpɒθəsɪs /
                  </div>
                  <div class="anim-translation-tooltip-bottom">
                    <strong>假设</strong><span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">{{ settings.translationEngine === 'google' ? 'Google' : settings.translationEngine === 'deepl' ? 'DeepL' : 'Bing' }}</span>
                  </div>
                  <div class="anim-click-ripple-trans"></div>
                  <svg class="anim-cursor-trans" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </span>
              </div>
            </div>
          </div>

          <!-- 位置 2：上方 -->
          <div class="preview-box" :class="{ active: settings.translationEngine !== 'none' && settings.translationPosition === 'top' }" @click="settings.translationEngine !== 'none' && (settings.translationPosition = 'top')">
            <div class="preview-title">显示于文字上方</div>
            <div class="anim-container anim-translation" style="height: 140px;">
              <div class="anim-text" style="padding-top: 40px;">
                <span class="trans-target-word">
                  <span style="color: #007aff;">hypothesis</span>
                  <!-- 黑色音标悬浮窗 (模拟) -->
                  <div class="anim-badge-black trans-ipa-badge" :style="{ top: '-24px', opacity: settings.showSingleClickIPA ? '' : '0 !important', transition: 'opacity 0.2s ease' }">
                    / haɪˈpɒθəsɪs /
                  </div>
                  <!-- 直角灰色翻译悬浮窗避让到上方 -->
                  <div class="anim-translation-tooltip-top" :style="{ top: settings.showSingleClickIPA ? '-68px' : '-34px', transition: 'top 0.2s ease' }">
                    <strong>假设</strong><span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">{{ settings.translationEngine === 'google' ? 'Google' : settings.translationEngine === 'deepl' ? 'DeepL' : 'Bing' }}</span>
                  </div>
                  <div class="anim-click-ripple-trans"></div>
                  <svg class="anim-cursor-trans" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Selection Translation Mode -->
      <section class="settings-card">
        <h2>划词翻译模式</h2>
        <p class="section-desc">配置拖动选中文本时的翻译行为。翻译悬浮窗与发音相互独立，可同时启用。</p>

        <div class="animation-previews" style="grid-template-columns: 1fr 1fr;">
          <!-- 选中自动翻译 -->
          <div class="preview-box" :class="{ active: settings.enableAutoTranslate && settings.translationEngine !== 'none' }" @click="settings.translationEngine !== 'none' && (settings.enableAutoTranslate = !settings.enableAutoTranslate)">
            <div class="preview-title">选中自动翻译</div>
            <div class="anim-container anim-sel-trans-auto" style="height: 120px;">
              <div class="anim-text">
                He was
                <span class="anim-selection sel-trans-sel">
                  locking eyes
                  <div class="anim-translation-tooltip-bottom sel-trans-tooltip-auto">
                    <strong>锁定目光</strong><span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">{{ settings.translationEngine === 'google' ? 'Google' : settings.translationEngine === 'deepl' ? 'DeepL' : 'Bing' }}</span>
                  </div>
                  <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </span>
                with her.
              </div>
            </div>
          </div>

          <!-- 选中点击翻译 -->
          <div class="preview-box" :class="{ active: settings.enableClickTranslate && settings.translationEngine !== 'none' }" @click="settings.translationEngine !== 'none' && (settings.enableClickTranslate = !settings.enableClickTranslate)">
            <div class="preview-title">选中点击翻译</div>
            <div class="anim-container anim-sel-trans-click" style="height: 120px;">
              <div class="anim-text">
                He was
                <span class="anim-selection sel-trans-sel-click">
                  locking eyes
                  <div class="anim-translation-tooltip-bottom sel-trans-tooltip-click">
                    <strong>锁定目光</strong><span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">{{ settings.translationEngine === 'google' ? 'Google' : settings.translationEngine === 'deepl' ? 'DeepL' : 'Bing' }}</span>
                  </div>
                  <div class="anim-click-ripple sel-trans-ripple"></div>
                  <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </span>
                with her.
              </div>
            </div>
          </div>
        </div>

        <div class="animation-previews" style="grid-template-columns: 1fr; margin-top: 16px;">
          <!-- 选中长按翻译 -->
          <div class="preview-box" :class="{ active: settings.enableLongPressTranslate && settings.translationEngine !== 'none' }" @click="settings.translationEngine !== 'none' && (settings.enableLongPressTranslate = !settings.enableLongPressTranslate)">
            <div class="preview-title">长按 AI 翻译</div>
            <div class="anim-container anim-sel-trans-longpress" style="height: 120px;">
              <div class="anim-text">
                He was
                <span class="anim-selection sel-trans-sel-longpress">
                  locking eyes
                  <div class="anim-translation-tooltip-bottom sel-trans-tooltip-longpress">
                    <strong>锁定目光</strong><span class="engine-tag" v-if="settings.showTranslationEngine && settings.translationEngine !== 'none'">AI</span>
                  </div>
                  <div class="anim-longpress-ring-container">
                    <svg class="anim-longpress-ring" viewBox="0 0 32 32">
                      <circle class="ring-progress" cx="16" cy="16" r="14"></circle>
                    </svg>
                  </div>
                  <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </span>
                with her.
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Selection Pronunciation Settings -->
      <section class="settings-card">
        <h2>划词发音模式</h2>
        <p class="section-desc">配置拖动选中文本时的发音行为。直接点击下方卡片即可切换模式。</p>

        <div class="animation-previews">
          <!-- Single Click Mode Preview -->
          <div class="preview-box" :class="{ active: settings.enableSingleClickPronounce }" @click="settings.enableSingleClickPronounce = !settings.enableSingleClickPronounce">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 12px; margin-bottom: 8px;">
              <div class="preview-title" style="margin-bottom: 0;">单击发音</div>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #666; cursor: pointer; z-index: 10;" @click.stop>
                <input type="checkbox" v-model="settings.showSingleClickIPA" style="margin: 0; width: 12px; height: 12px;" />
                显示音标悬浮窗
              </label>
            </div>
            <div class="anim-container anim-single-click">
              <div class="anim-text">
                He was 
                <span class="anim-selection" style="background: transparent;">
                  locking
                  <div class="anim-badge-black" :style="{ opacity: settings.showSingleClickIPA ? '' : '0 !important' }">
                    / 'lɒkɪŋ /
                  </div>
                  <div class="anim-badge" :style="{ top: '-24px', marginLeft: settings.showSingleClickIPA ? '65px' : '0', transition: 'margin-left 0.2s ease' }">
                    <svg class="anim-speaker" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="wave1"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="wave2"></path></svg>
                  </div>
                  <div class="anim-click-ripple" style="left: 25px;"></div>
                  <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </span> 
                eyes with her.
              </div>
            </div>
          </div>

          <!-- Auto Mode Preview -->
          <div class="preview-box" :class="{ active: settings.enableAutoPronounce }" @click="settings.enableAutoPronounce = !settings.enableAutoPronounce">
            <div class="preview-title">选中自动发音</div>
            <div class="anim-container anim-auto">
              <div class="anim-text">
                He was 
                <span class="anim-selection">
                  locking eyes
                  <div class="anim-badge">
                    <svg class="anim-speaker" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="wave1"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="wave2"></path></svg>
                  </div>
                  <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </span> 
                with her.
              </div>
            </div>
          </div>

          <!-- Click Mode Preview -->
          <div class="preview-box" :class="{ active: settings.enableClickPronounce }" @click="settings.enableClickPronounce = !settings.enableClickPronounce">
            <div class="preview-title">选中点击发音</div>
            <div class="anim-container anim-click">
              <div class="anim-text">
                He was 
                <span class="anim-selection">
                  locking eyes
                  <div class="anim-badge">
                    <svg class="anim-speaker" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="wave1"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="wave2"></path></svg>
                  </div>
                  <div class="anim-click-ripple"></div>
                  <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </span> 
                with her.
              </div>
            </div>
          </div>

          <!-- Shortcut Mode Preview -->
          <div class="preview-box" :class="{ active: settings.enableShortcutPronounce }" @click="settings.enableShortcutPronounce = !settings.enableShortcutPronounce">
            <div class="preview-title">快捷键发音</div>
            <div class="anim-container anim-shortcut">
              <div class="anim-text">
                He was 
                <span class="anim-selection">
                  locking eyes
                  <div class="anim-badge">
                    <svg class="anim-speaker" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="wave1"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="wave2"></path></svg>
                  </div>
                  <svg class="anim-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </span> 
                with her.
              </div>
              <div class="anim-keyboard-key">R</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Paragraph Translation Settings -->
      <section class="settings-card">
        <h2>段落翻译与无缝注音</h2>
        <p class="section-desc">配置段落翻译的触发快捷键。它能在不破坏原有英文版面的前提下，将中文翻译像拼音一样注入到生词上方。</p>

        <div style="margin-bottom: 24px; padding: 16px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px;">触发快捷键</div>
            <div style="font-size: 12px; color: #6b7280;">划选一段英文文本，按下该组合键即可进行段落注音翻译。</div>
          </div>
          <button 
            @click="startRecordingShortcut" 
            style="background: #fff; border: 1px solid #d1d5db; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; cursor: pointer; min-width: 140px; text-align: center; font-weight: 500; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"
            :style="isRecordingShortcut ? 'border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.2); color: #3b82f6;' : 'color: #374151;'"
          >
            {{ isRecordingShortcut ? '请按下组合键...' : formatShortcutDisplay(settings.paragraphShortcut) }}
          </button>
        </div>
        
        <div v-if="shortcutWarning" style="margin-top: -16px; margin-bottom: 24px; padding: 12px 16px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a; display: flex; align-items: flex-start; gap: 8px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          <span style="font-size: 13px; color: #92400e; line-height: 1.5;">{{ shortcutWarning }}</span>
        </div>

        <div class="animation-previews" style="grid-template-columns: 1fr;">
          <div class="preview-box" :class="{ active: !!settings.paragraphShortcut }">
            <div class="preview-title">沉浸式 Ruby 注音效果演示</div>
            <div class="anim-container anim-paragraph-trans" style="height: 220px; padding: 24px 32px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; background: #fafafa; gap: 16px;">
              <div class="anim-text" style="font-size: 15px; line-height: 1.8; color: #333; text-align: left; width: 100%;">
                Before reading the text, make sure to check the context.
              </div>
              <div class="anim-text anim-paragraph-text" style="font-size: 15px; line-height: 1.8; color: #333; position: relative; text-align: left; width: 100%;">
                This feature injects
                <span class="anim-ruby-wrapper ruby-color-1">
                  <span class="anim-ruby-base">seamless</span>
                  <span class="anim-ruby-text">无缝的</span>
                </span>
                translations directly
                <span class="anim-ruby-wrapper ruby-color-2">
                  <span class="anim-ruby-base">above</span>
                  <span class="anim-ruby-text">上方</span>
                </span>
                the English words.
              </div>
              <div class="anim-text" style="font-size: 15px; line-height: 1.8; color: #333; text-align: left; width: 100%;">
                It helps you read and learn efficiently without interruption.
              </div>
              <!-- Floating keyboard hint animation -->
              <div class="anim-floating-shortcut" v-if="settings.paragraphShortcut">
                <span class="key" v-for="key in getShortcutKeys(settings.paragraphShortcut)" :key="key">{{ key }}</span>
              </div>
              <!-- Floating mouse cursor -->
              <svg class="anim-cursor anim-paragraph-cursor" width="24" height="24" viewBox="0 0 24 24"><path d="M4 4l5.8 16.7c.3.8 1.4.9 1.8.2l2.6-5.2 5.2-2.6c.7-.4.6-1.5-.2-1.8L4 4z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>
      </section>

      <!-- TTS Settings -->
      <section class="settings-card">
        <h2>语音合成 (TTS) 设置</h2>
        <p class="section-desc">配置发音人的语言、语速及音量。</p>
        
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
          <button class="test-btn" @click="testTTS" :disabled="testingTTS" :class="{ 'is-loading': testingTTS }">
            <svg v-if="testingTTS" class="playing-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path class="wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path class="wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            {{ testingTTS ? '播放中...' : '测试发音' }}
          </button>
          <span v-if="testResultTTS" class="test-result-inline" :class="{ error: testResultTTS.includes('失败') }">
            <svg v-if="testResultTTS.includes('成功')" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <svg v-else-if="testResultTTS.includes('失败')" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            {{ testResultTTS.replace(/❌|✅/g, '').trim() }}
          </span>
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
  width: 32px;
  height: 32px;
  display: block;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 24px;
  background: #171717;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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

.test-btn.is-loading {
  background: #404040;
}

.spinner {
  animation: spin 1s linear infinite;
}

.playing-icon .wave1 {
  animation: audioWave 1s infinite;
}

.playing-icon .wave2 {
  animation: audioWave 1s infinite 0.2s;
}

@keyframes audioWave {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.test-result-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #10b981;
  font-weight: 500;
  animation: fadeIn 0.3s ease;
}

.test-result-inline.error {
  color: #ef4444;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
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



/* Mode Animations & Previews */
.animation-previews {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.preview-box {
  flex: 1;
  border: 2px solid #e5e5e5;
  border-radius: 8px;
  padding: 16px;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}

.preview-box.active {
  border-color: #007aff;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.1);
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
  color: #737373;
  margin-bottom: 12px;
  text-align: center;
}

.preview-box.active .preview-title {
  color: #007aff;
}

.anim-container {
  position: relative;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 6px;
  font-size: 15px;
  font-family: -apple-system, sans-serif;
  color: #333;
}

.anim-text {
  position: relative;
}

.anim-selection {
  position: relative;
  display: inline-block;
  background: linear-gradient(to right, #b4d7ff 50%, transparent 50%);
  background-size: 200% 100%;
  background-position: 100% 0;
  border-radius: 2px;
}

.anim-badge {
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%) scale(0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
}

.anim-speaker {
  color: #0a84ff;
  display: block;
}

.anim-cursor {
  position: absolute;
  top: 10px;
  left: -5px;
  z-index: 10;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
  transform-origin: top left;
}

.anim-click-ripple {
  position: absolute;
  top: 10px;
  left: 45px;
  width: 20px;
  height: 20px;
  border: 2px solid #007aff;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

/* Keyframes for Auto Mode */
.anim-auto .anim-cursor {
  animation: autoCursorDrag 4s infinite;
}
.anim-auto .anim-selection {
  animation: autoSelectionHighlight 4s infinite;
}
.anim-auto .anim-badge {
  animation: badgePopAuto 4s infinite;
}
.anim-auto .wave1, .anim-auto .wave2 {
  animation: wavePulse 4s infinite;
}

/* Keyframes for Click Mode */
.anim-click .anim-cursor {
  animation: clickCursorDragAndClick 4s infinite;
}
.anim-click .anim-selection {
  animation: clickSelectionHighlight 4s infinite;
}
.anim-click .anim-badge {
  animation: badgePopClick 4s infinite;
}
.anim-click .anim-click-ripple {
  animation: clickRipple 4s infinite;
}
.anim-click .wave1, .anim-click .wave2 {
  animation: wavePulseClick 4s infinite;
}

@keyframes autoCursorDrag {
  0%, 15% { transform: translate(0, 0); }
  35% { transform: translate(90px, 0); }
  45%, 100% { transform: translate(110px, 20px); }
}

@keyframes autoSelectionHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes badgePopAuto {
  0%, 35% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.8); }
  40%, 90% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  95%, 100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

@keyframes wavePulse {
  0%, 40% { opacity: 0; }
  45%, 55%, 65%, 75% { opacity: 1; }
  50%, 60%, 70%, 80% { opacity: 0.3; }
  85%, 100% { opacity: 0; }
}

.anim-badge-black {
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%) scale(0.8);
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
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
}
.anim-badge-black::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  border-width: 4px 4px 0;
  border-style: solid;
  border-color: rgba(28, 28, 30, 0.92) transparent transparent transparent;
}

@keyframes clickCursorDragAndClick {
  0%, 15% { transform: translate(0, 0) scale(1); }
  35% { transform: translate(90px, 0) scale(1); }
  45%, 55% { transform: translate(110px, 20px) scale(1); }
  65% { transform: translate(45px, 0) scale(1); }
  70% { transform: translate(45px, 0) scale(0.85); }
  75% { transform: translate(45px, 0) scale(1); }
  85%, 100% { transform: translate(110px, 20px) scale(1); }
}

@keyframes clickSelectionHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes clickRipple {
  0%, 69% { opacity: 0; transform: translate(-50%, -50%) scale(0.1); }
  70% { opacity: 1; transform: translate(-50%, -50%) scale(0.1); }
  75% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
  76%, 100% { opacity: 0; }
}

@keyframes badgePopClick {
  0%, 72% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.8); }
  76%, 95% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

@keyframes wavePulseClick {
  0%, 75% { opacity: 0; }
  78%, 86% { opacity: 1; }
  82%, 90% { opacity: 0.3; }
  94%, 100% { opacity: 0; }
}

/* Keyframes for Shortcut Mode */
.anim-shortcut .anim-cursor {
  animation: shortcutCursorDrag 4s infinite;
}
.anim-shortcut .anim-selection {
  animation: shortcutSelectionHighlight 4s infinite;
}
.anim-shortcut .anim-badge {
  animation: badgePopShortcut 4s infinite;
}
.anim-shortcut .wave1, .anim-shortcut .wave2 {
  animation: wavePulseShortcut 4s infinite;
}
.anim-keyboard-key {
  position: absolute;
  bottom: 15px;
  right: 15px;
  width: 28px;
  height: 28px;
  background: #fdfdfd;
  border: 1px solid #d4d4d4;
  border-bottom: 3px solid #d4d4d4;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #333;
  opacity: 0;
  animation: keyboardKeyPress 4s infinite;
}

@keyframes shortcutCursorDrag {
  0%, 15% { transform: translate(0, 0); }
  35% { transform: translate(90px, 0); }
  45%, 100% { transform: translate(110px, 20px); }
}

@keyframes shortcutSelectionHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes badgePopShortcut {
  0%, 55% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.8); }
  60%, 90% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  95%, 100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

@keyframes wavePulseShortcut {
  0%, 60% { opacity: 0; }
  65%, 75% { opacity: 1; }
  70%, 80% { opacity: 0.3; }
  85%, 100% { opacity: 0; }
}

@keyframes keyboardKeyPress {
  0%, 45% { opacity: 0; transform: translateY(10px); }
  50% { opacity: 1; transform: translateY(0); border-bottom-width: 3px; background: #fdfdfd; }
  55% { opacity: 1; transform: translateY(2px); border-bottom-width: 1px; background: #f0f0f0; }
  60% { opacity: 1; transform: translateY(0); border-bottom-width: 3px; background: #fdfdfd; }
  85%, 100% { opacity: 0; transform: translateY(0); }
}

/* Keyframes for Single Click */
.anim-single-click .anim-cursor {
  animation: singleClickCursor 4s infinite;
}
.anim-single-click .anim-badge-black,
.anim-single-click .anim-badge {
  animation: badgePopSingleClick 4s infinite;
}
.anim-single-click .anim-click-ripple {
  animation: singleClickRipple 4s infinite;
}
.anim-single-click .wave1, .anim-single-click .wave2 {
  animation: wavePulseSingleClick 4s infinite;
}

@keyframes singleClickCursor {
  0%, 15% { transform: translate(-30px, 20px) scale(1); }
  35% { transform: translate(25px, 0px) scale(1); }
  45% { transform: translate(25px, 0px) scale(0.85); }
  50%, 65% { transform: translate(25px, 0px) scale(1); }
  75%, 100% { transform: translate(-30px, 20px) scale(1); }
}

@keyframes singleClickRipple {
  0%, 44% { opacity: 0; transform: translate(-50%, -50%) scale(0.1); }
  45% { opacity: 1; transform: translate(-50%, -50%) scale(0.1); }
  50% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
  51%, 100% { opacity: 0; }
}

@keyframes badgePopSingleClick {
  0%, 46% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.8); }
  50%, 80% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  85%, 100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

@keyframes wavePulseSingleClick {
  0%, 50% { opacity: 0; }
  53%, 63%, 73% { opacity: 1; }
  58%, 68%, 78% { opacity: 0.3; }
  83%, 100% { opacity: 0; }
}

/* Translation Preview Animations */
.trans-target-word {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.anim-translation .trans-ipa-badge {
  opacity: 0;
  animation: transIpaPop 4s infinite;
}

.anim-translation .anim-cursor-trans {
  position: absolute;
  top: 10px;
  left: -5px;
  z-index: 10;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
  transform-origin: top left;
  animation: transClickCursor 4s infinite;
}

.anim-translation .anim-click-ripple-trans {
  position: absolute;
  top: 10px;
  left: 30px;
  width: 20px;
  height: 20px;
  border: 2px solid #007aff;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: singleClickRipple 4s infinite;
}

.anim-translation-tooltip-bottom,
.anim-translation-tooltip-top {
  position: absolute;
  left: 50%;
  transform: translateX(-50%); /* Base centering to fix offset */
  background-color: #f0f0f0;
  color: #333333;
  border: 1px solid #dcdcdc;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 6px 10px;
  font-size: 13px;
  z-index: 20;
  border-radius: 0px;
  pointer-events: none;
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: left;
  gap: 8px;
  white-space: nowrap;
  width: max-content;
}

.anim-translation-tooltip-bottom {
  top: 30px;
  animation: transTooltipPopBottom 4s infinite;
}

.anim-translation-tooltip-top {
  top: -68px; /* High enough above the IPA badge */
  animation: transTooltipPopTop 4s infinite;
  z-index: 30;
}

.anim-translation-tooltip-bottom .engine-tag,
.anim-translation-tooltip-top .engine-tag {
  font-size: 10px;
  color: #888;
  border-left: 1px solid #ccc;
  padding-left: 8px;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;
}

@keyframes transClickCursor {
  0%, 15% { transform: translate(-30px, 20px) scale(1); }
  35% { transform: translate(30px, 0px) scale(1); }
  45% { transform: translate(30px, 0px) scale(0.85); }
  50%, 75% { transform: translate(30px, 0px) scale(1); }
  85%, 100% { transform: translate(-30px, 20px) scale(1); }
}

@keyframes transTooltipPopBottom {
  0%, 46% { opacity: 0; margin-top: -5px; }
  50%, 80% { opacity: 1; margin-top: 0px; }
  85%, 100% { opacity: 0; margin-top: 5px; }
}

@keyframes transTooltipPopTop {
  0%, 46% { opacity: 0; margin-top: 5px; }
  50%, 80% { opacity: 1; margin-top: 0px; }
  85%, 100% { opacity: 0; margin-top: -5px; }
}

@keyframes transIpaPop {
  0%, 46% { opacity: 0; transform: translateX(-50%) translateY(5px) scale(0.9); }
  50%, 80% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  85%, 100% { opacity: 0; transform: translateX(-50%) translateY(-5px) scale(0.9); }
}

/* ─── Selection Auto-Translate Animations ─── */
.anim-sel-trans-auto .anim-cursor {
  animation: selTransAutoCursor 4s infinite;
}
.anim-sel-trans-auto .sel-trans-sel {
  animation: selTransAutoHighlight 4s infinite;
}
.anim-sel-trans-auto .sel-trans-tooltip-auto {
  animation: selTransAutoTooltip 4s infinite;
}

@keyframes selTransAutoCursor {
  0%, 15% { transform: translate(0, 0) scale(1); }
  35% { transform: translate(90px, 0) scale(1); }
  45%, 100% { transform: translate(110px, 20px) scale(1); }
}

@keyframes selTransAutoHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes selTransAutoTooltip {
  0%, 37% { opacity: 0; margin-top: -5px; }
  42%, 90% { opacity: 1; margin-top: 0px; }
  95%, 100% { opacity: 0; margin-top: 5px; }
}

/* ─── Selection Click-Translate Animations ─── */
.anim-sel-trans-click .anim-cursor {
  animation: selTransClickCursor 4s infinite;
}
.anim-sel-trans-click .sel-trans-sel-click {
  animation: selTransClickHighlight 4s infinite;
}
.anim-sel-trans-click .sel-trans-tooltip-click {
  animation: selTransClickTooltip 4s infinite;
}
.anim-sel-trans-click .sel-trans-ripple {
  animation: selTransClickRipple 4s infinite;
}

@keyframes selTransClickCursor {
  0%, 15% { transform: translate(0, 0) scale(1); }
  35% { transform: translate(90px, 0) scale(1); }
  45%, 55% { transform: translate(110px, 20px) scale(1); }
  65% { transform: translate(45px, 0) scale(1); }
  70% { transform: translate(45px, 0) scale(0.85); }
  75% { transform: translate(45px, 0) scale(1); }
  85%, 100% { transform: translate(110px, 20px) scale(1); }
}

@keyframes selTransClickHighlight {
  0%, 15% { background-position: 100% 0; }
  35%, 100% { background-position: 0 0; }
}

@keyframes selTransClickRipple {
  0%, 69% { opacity: 0; transform: translate(-50%, -50%) scale(0.1); }
  70% { opacity: 1; transform: translate(-50%, -50%) scale(0.1); }
  75% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
  76%, 100% { opacity: 0; }
}

@keyframes selTransClickTooltip {
  0%, 72% { opacity: 0; margin-top: -5px; }
  76%, 92% { opacity: 1; margin-top: 0px; }
  97%, 100% { opacity: 0; margin-top: 5px; }
}

/* ─── Selection LongPress-Translate Animations ─── */
.anim-sel-trans-longpress .anim-cursor {
  animation: selTransLongPressCursor 4s infinite;
}
.anim-sel-trans-longpress .sel-trans-sel-longpress {
  animation: selTransClickHighlight 4s infinite;
}
.anim-sel-trans-longpress .sel-trans-tooltip-longpress {
  animation: selTransLongPressTooltip 4s infinite;
}
.anim-sel-trans-longpress .anim-longpress-ring-container {
  position: absolute;
  top: 15px;
  left: 45px;
  width: 32px;
  height: 32px;
  margin-top: -16px;
  margin-left: -16px;
  pointer-events: none;
  animation: selTransLongPressRingContainer 4s infinite;
}
.anim-sel-trans-longpress .anim-longpress-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.anim-sel-trans-longpress .anim-longpress-ring .ring-progress {
  fill: transparent;
  stroke: #4a90d9;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 87.96;
  stroke-dashoffset: 87.96;
  opacity: 0.6;
  animation: selTransLongPressRing 4s infinite;
}

@keyframes selTransLongPressCursor {
  0%, 15% { transform: translate(0, 0) scale(1); }
  30% { transform: translate(90px, 0) scale(1); }
  40%, 45% { transform: translate(110px, 20px) scale(1); }
  55% { transform: translate(45px, 0) scale(1); }
  60%, 75% { transform: translate(45px, 0) scale(0.85); }
  80% { transform: translate(45px, 0) scale(1); }
  85%, 100% { transform: translate(110px, 20px) scale(1); }
}

@keyframes selTransLongPressRingContainer {
  0%, 57% { opacity: 0; transform: scale(1); }
  60% { opacity: 1; transform: scale(1); }
  75% { opacity: 1; transform: scale(1); }
  78% { opacity: 0; transform: scale(1.15); }
  79%, 100% { opacity: 0; transform: scale(1); }
}

@keyframes selTransLongPressRing {
  0%, 59% { stroke-dashoffset: 87.96; }
  60% { stroke-dashoffset: 87.96; }
  75% { stroke-dashoffset: 0; }
  76%, 100% { stroke-dashoffset: 0; }
}

@keyframes selTransLongPressTooltip {
  0%, 75% { opacity: 0; margin-top: -5px; }
  79%, 92% { opacity: 1; margin-top: 0px; }
  97%, 100% { opacity: 0; margin-top: 5px; }
}

/* ─── Paragraph Translation (Ruby) Animations ─── */
.anim-paragraph-trans {
  position: relative;
  overflow: hidden;
}

.anim-ruby-wrapper {
  display: inline-block;
  position: relative;
  text-align: center;
  line-height: 1; /* Fix line-height to prevent bottom: 100% from floating too high */
}

/* Base text is normal color initially, then animates */
.anim-ruby-base {
  display: inline-block;
  color: inherit; 
}

.ruby-color-1 .anim-ruby-base {
  animation: rubyBaseColor1 4s infinite;
}

@keyframes rubyBaseColor1 {
  0%, 35% { color: inherit; }
  45%, 85% { color: #10b981; }
  90%, 100% { color: inherit; }
}

.ruby-color-2 .anim-ruby-base {
  animation: rubyBaseColor2 4s infinite;
}

@keyframes rubyBaseColor2 {
  0%, 35% { color: inherit; }
  45%, 85% { color: #3b82f6; }
  90%, 100% { color: inherit; }
}

.anim-paragraph-text {
  animation: paragraphTextGray 4s infinite;
  transition: color 0.2s;
}

@keyframes paragraphTextGray {
  0%, 31% { color: #333; }
  33%, 85% { color: #9ca3af; } /* Turn gray right after shortcut (32%) */
  90%, 100% { color: #333; }
}

.anim-ruby-text {
  position: absolute;
  bottom: calc(100% + 2px); /* Position slightly above the word */
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  animation: rubyTextFadeIn 4s infinite;
}

.ruby-color-1 .anim-ruby-text {
  color: #10b981; /* Emerald green */
}

.ruby-color-2 .anim-ruby-text {
  color: #3b82f6; /* Blue */
  animation-delay: 0.1s;
}

@keyframes rubyTextFadeIn {
  0%, 35% { opacity: 0; transform: translateX(-50%) translateY(5px) scale(0.9); }
  45%, 85% { opacity: 1; transform: translateX(-50%) translateY(-2px) scale(1); }
  90%, 100% { opacity: 0; transform: translateX(-50%) translateY(0px) scale(0.9); }
}

.anim-floating-shortcut {
  position: absolute;
  bottom: 16px;
  right: 24px;
  display: flex;
  gap: 6px;
  opacity: 0;
  animation: floatingShortcutAnim 4s infinite;
}

.anim-floating-shortcut .key {
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  color: #374151;
  box-shadow: 0 2px 0 #d1d5db;
  transition: all 0.1s;
}

@keyframes floatingShortcutAnim {
  0%, 15% { opacity: 0; transform: translateY(10px); }
  20%, 30% { opacity: 1; transform: translateY(0); }
  /* Key press effect */
  32% { transform: translateY(2px); }
  33% { opacity: 1; transform: translateY(0); }
  /* Fade out */
  85% { opacity: 1; transform: translateY(0); }
  90%, 100% { opacity: 0; transform: translateY(10px); }
}

.anim-paragraph-cursor {
  position: absolute;
  top: 50%;
  left: 30%;
  animation: paragraphCursorAnim 4s infinite;
  z-index: 10;
}

@keyframes paragraphCursorAnim {
  0%, 5% { transform: translate(-80px, 80px); opacity: 0; }
  10%, 15% { transform: translate(0px, 0px); opacity: 1; }
  /* Hover while keyboard is pressed and translation happens */
  15%, 85% { transform: translate(0px, 0px); opacity: 1; }
  90%, 100% { transform: translate(-80px, 80px); opacity: 0; }
}
</style>
