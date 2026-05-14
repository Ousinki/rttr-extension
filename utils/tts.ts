// 防止 Chrome 的垃圾回收机制导致发音被意外中断
let utteranceRef: SpeechSynthesisUtterance | null = null;

const debugLog = (...args: any[]) => {
  // 仅在开发环境中输出调试信息，生产环境中会被 Vite/WXT 自动移除
  if (import.meta.env.DEV) {
    console.log('[RTTR TTS DEBUG]', ...args);
  }
};

// 尽早触发声音列表的加载
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
}

export function speakText(text: string, currentSettings?: any, onComplete?: (success: boolean, errorMsg?: string) => void) {
  debugLog('speakText 被调用', { text: text.substring(0, 20) + '...', currentSettings });
  
  if (/[\u4e00-\u9fa5]/.test(text)) {
    debugLog('跳过 TTS：文本包含中文字符');
    if (onComplete) onComplete(false, 'Text contains Chinese characters');
    return;
  }

  if (!('speechSynthesis' in window)) {
    console.error('[RTTR TTS] 当前浏览器不支持 speechSynthesis');
    if (onComplete) onComplete(false, 'Browser does not support speechSynthesis');
    return;
  }
  
  const playVoice = () => {
    let voices = window.speechSynthesis.getVoices();
    debugLog('获取到系统发音人列表，数量:', voices.length);

    const doSpeak = () => {
      debugLog('进入 doSpeak 准备播放');
      // 防止 TTS 引擎将全大写单词（如 RREPOST）识别为缩写并逐字母拼读
      const utteranceText = (text === text.toUpperCase() && text.length > 1) ? text.toLowerCase() : text;
      const utterance = new SpeechSynthesisUtterance(utteranceText);
      utteranceRef = utterance; // 挂载到全局引用，防止被 GC
      
      let isRemoteVoice = false;

      if (currentSettings) {
        utterance.lang = currentSettings.ttsLanguage || 'en-US';
        utterance.rate = currentSettings.ttsRate || 0.85;
        utterance.volume = currentSettings.ttsVolume ?? 1.0;
        
        const voiceURI = currentSettings.ttsVoiceURI;
        if (voiceURI) {
          const selectedVoice = voices.find(v => v.voiceURI === voiceURI);
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            isRemoteVoice = !selectedVoice.localService;
            debugLog('成功匹配到指定发音人:', selectedVoice.name, 'local:', selectedVoice.localService);
          } else {
            debugLog('无法找到指定的发音人:', voiceURI, '尝试降级...');
          }
        }
        
        if (!utterance.voice) {
          // 降级回退策略：优先找 Google，否则找对应语言的默认声音
          const fallbackVoice = voices.find(v => v.name.includes('Google US English')) ||
                                voices.find(v => v.lang === utterance.lang) ||
                                voices.find(v => v.default) || 
                                voices[0];
          if (fallbackVoice) {
            utterance.voice = fallbackVoice;
            isRemoteVoice = !fallbackVoice.localService;
            debugLog('使用降级发音人:', fallbackVoice.name, 'local:', fallbackVoice.localService);
          } else {
            console.warn('[RTTR TTS] 没有任何发音人可用，依赖系统默认');
          }
        }
      } else {
        utterance.lang = 'en-US';
        utterance.rate = 0.85;
        debugLog('无 settings，使用默认设置 (en-US, 0.85x)');
      }
      
      debugLog(`最终 utterance 配置 -> lang: ${utterance.lang}, rate: ${utterance.rate}, volume: ${utterance.volume}, voice: ${utterance.voice ? utterance.voice.name : '未分配'}`);
      
      let watchdog: ReturnType<typeof setTimeout>;
      const cleanup = (success: boolean, reason: string, errorMsg?: string) => {
        debugLog(`执行 cleanup，成功: ${success}, 原因: ${reason}`);
        clearTimeout(watchdog);
        utteranceRef = null;
        if (onComplete) onComplete(success, errorMsg);
      };

      utterance.onstart = () => debugLog('utterance 事件: onstart (开始发音)');
      utterance.onend = () => {
        debugLog('utterance 事件: onend (发音正常结束)');
        cleanup(true, 'onend');
      };
      utterance.onerror = (e) => {
        debugLog('utterance 事件: onerror (发音发生错误):', e);
        // 如果是因为我们主动 cancel() 导致的 interrupted，不单独报错，让 watchdog 处理
        if (e.error !== 'interrupted') {
          console.error('[RTTR TTS] 语音合成错误:', e);
          cleanup(false, `onerror: ${e.error}`, `语音合成错误: ${e.error}`);
        }
      };
      utterance.onpause = () => debugLog('utterance 事件: onpause');
      utterance.onresume = () => debugLog('utterance 事件: onresume');

      // Watchdog 超时保护：防止引擎陷入 pending 死锁状态
      const maxDuration = Math.max(10000, text.length * 300);
      watchdog = setTimeout(() => {
        console.warn(`[RTTR TTS] 播放超时或卡死 (超过 ${maxDuration}ms)，强制重置`);
        window.speechSynthesis.cancel();
        
        let errorMsg = '语音播放超时。';
        if (isRemoteVoice) {
          errorMsg = '在线语音获取超时，可能是网络无法连接到发音服务器。请尝试在设置中切换为本地 (系统默认) 发音人。';
        }
        cleanup(false, 'watchdog_timeout', errorMsg);
      }, maxDuration);

      debugLog('正在调用 window.speechSynthesis.speak(utterance)...');
      window.speechSynthesis.speak(utterance);
      debugLog('speak(utterance) 调用完成，当前引擎状态 -> speaking:', window.speechSynthesis.speaking, 'pending:', window.speechSynthesis.pending);
    };

    if (voices.length === 0) {
      debugLog('声音列表为空，等待 voiceschanged 事件...');
      let isHandled = false;
      const onVoicesReady = () => {
        if (isHandled) return;
        isHandled = true;
        voices = window.speechSynthesis.getVoices();
        debugLog('voiceschanged 触发，获取到声音数量:', voices.length);
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady);
        doSpeak();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesReady);
      
      setTimeout(() => {
        if (!isHandled) {
          console.warn('[RTTR TTS] 等待 voiceschanged 超时 (300ms)，强制继续...');
          isHandled = true;
          window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady);
          voices = window.speechSynthesis.getVoices();
          doSpeak();
        }
      }, 300);
    } else {
      doSpeak();
    }
  };

  debugLog(`初始化引擎状态 -> speaking: ${window.speechSynthesis.speaking}, pending: ${window.speechSynthesis.pending}`);
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    debugLog('引擎被占用，执行 cancel() 并延迟 50ms 后播放...');
    window.speechSynthesis.cancel();
    setTimeout(playVoice, 50);
  } else {
    playVoice();
  }
}
