export function speakText(text: string, currentSettings?: any, onComplete?: () => void) {
  if (!('speechSynthesis' in window)) {
    console.error('[RTTR TTS] 当前浏览器不支持 speechSynthesis');
    return;
  }
  
  const playVoice = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (currentSettings) {
      utterance.lang = currentSettings.ttsLanguage || 'en-US';
      utterance.rate = currentSettings.ttsRate || 0.85;
      utterance.volume = currentSettings.ttsVolume ?? 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const voiceURI = currentSettings.ttsVoiceURI;
      if (voiceURI) {
        const selectedVoice = voices.find(v => v.voiceURI === voiceURI);
        if (selectedVoice) utterance.voice = selectedVoice;
      } else {
        const googleVoice = voices.find(v => v.name.includes('Google US English'));
        if (googleVoice) utterance.voice = googleVoice;
      }
    } else {
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
    }
    
    utterance.onend = () => {
      if (onComplete) onComplete();
    };
    utterance.onerror = (e) => {
      if (onComplete) onComplete();
    };

    window.speechSynthesis.speak(utterance);
  };

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel();
    setTimeout(playVoice, 10);
  } else {
    playVoice();
  }
}
