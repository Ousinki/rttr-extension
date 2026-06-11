import { createWorker } from 'tesseract.js';
import { safeSendMessage } from '@/utils/content-messaging';
import { uiActions } from '@/utils/content-state';
import { speakText } from '@/utils/tts';

const SVG_ICONS = {
  settings: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  speak: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path class="rttr-wave1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path class="rttr-wave2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>',
};

export async function recognizeImageWord(img: HTMLImageElement, clientX: number, clientY: number, altText: string, currentSettings: any) {
  try {
    uiActions.showContextMenu([
      { type: 'header', label: '⏳ Fetching image...' },
      { type: 'divider', label: 'DIVIDER' },
      { icon: SVG_ICONS.speak, label: '朗读备用描述', onClick: () => speakText(altText, currentSettings) },
      { type: 'divider', label: 'DIVIDER' },
      { icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) }
    ], clientX, clientY);

    let safeImg = img;
    try {
      const testCanvas = document.createElement('canvas');
      testCanvas.width = 1; testCanvas.height = 1;
      const testCtx = testCanvas.getContext('2d');
      testCtx?.drawImage(img, 0, 0, 1, 1);
      testCanvas.toDataURL(); 
    } catch (e) {
      const res = await safeSendMessage({ type: 'FETCH_IMAGE_BASE64', url: img.src });
      if (res && res.base64) {
        safeImg = new Image();
        safeImg.src = res.base64;
        await new Promise((resolve) => { safeImg.onload = resolve; });
      } else {
        throw new Error("无法跨域获取图片数据");
      }
    }

    const rect = img.getBoundingClientRect();
    const scaleX = safeImg.naturalWidth / rect.width;
    const scaleY = safeImg.naturalHeight / rect.height;

    const clickX = (clientX - rect.left) * scaleX;
    const clickY = (clientY - rect.top) * scaleY;

    const cssCropWidth = 400;
    const cssCropHeight = 150;
    let cropWidth = cssCropWidth * scaleX;
    let cropHeight = cssCropHeight * scaleY;

    const useFullImage = cropWidth >= safeImg.naturalWidth * 0.8 || cropHeight >= safeImg.naturalHeight * 0.8;
    if (useFullImage) {
      cropWidth = safeImg.naturalWidth;
      cropHeight = safeImg.naturalHeight;
    }

    const cropX = useFullImage ? 0 : Math.max(0, clickX - cropWidth / 2);
    const cropY = useFullImage ? 0 : Math.max(0, clickY - cropHeight / 2);

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d')!;
    if (!ctx) return;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, cropWidth, cropHeight);
    ctx.drawImage(safeImg, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const imgData = ctx.getImageData(0, 0, cropWidth, cropHeight);
    const pixels = imgData.data;

    const gray = new Uint8Array(cropWidth * cropHeight);
    let sum = 0;
    for (let i = 0; i < gray.length; i++) {
      gray[i] = Math.round(pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114);
      sum += gray[i];
    }
    const avgBrightness = sum / gray.length;

    function applyBinarize(invert: boolean) {
      const d = ctx.getImageData(0, 0, cropWidth, cropHeight);
      const p = d.data;
      for (let i = 0; i < gray.length; i++) {
        let val = gray[i] > avgBrightness ? 255 : 0;
        if (invert) val = 255 - val;
        p[i * 4] = val;
        p[i * 4 + 1] = val;
        p[i * 4 + 2] = val;
      }
      ctx.putImageData(d, 0, 0);
      return canvas.toDataURL('image/png');
    }

    function extractWords(data: any): any[] {
      const w: any[] = [];
      if (data.blocks) {
        for (const block of data.blocks) {
          if (block.paragraphs) {
            for (const para of block.paragraphs) {
              if (para.lines) {
                for (const line of para.lines) {
                  if (line.words) w.push(...line.words);
                }
              }
            }
          }
        }
      }
      return w;
    }

    uiActions.showContextMenu([
      { type: 'header', label: '⏳ Recognizing...' },
      { type: 'divider', label: 'DIVIDER' },
      { icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) }
    ], clientX, clientY);

    const worker = await createWorker('eng');
    let words: any[] = [];

    const img1 = applyBinarize(false);
    const r1 = await worker.recognize(img1, {}, { blocks: true });
    words = extractWords(r1.data);

    if (words.length === 0) {
      const img2 = applyBinarize(true);
      const r2 = await worker.recognize(img2, {}, { blocks: true });
      words = extractWords(r2.data);
    }

    if (words.length === 0) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, cropWidth, cropHeight);
      ctx.drawImage(safeImg, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      const img3 = canvas.toDataURL('image/png');
      const r3 = await worker.recognize(img3, {}, { blocks: true });
      words = extractWords(r3.data);
    }

    await worker.terminate();

    const pointX = clickX - cropX;
    const pointY = clickY - cropY;

    let targetWord = '';
    if (words.length > 0) {
      let minDist = Infinity;
      let bestWord = '';
      for (const w of words) {
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;
        const cy = (w.bbox.y0 + w.bbox.y1) / 2;
        const dist = Math.sqrt((pointX - cx) ** 2 + (pointY - cy) ** 2);
        const wordHeight = w.bbox.y1 - w.bbox.y0;
        const maxDist = Math.max(wordHeight, 30 * scaleX);
        if (dist < minDist && dist < maxDist) {
          minDist = dist;
          bestWord = w.text.trim().replace(/[^a-zA-Z'-]/g, '');
        }
      }
      targetWord = bestWord;
    }

    if (targetWord) {
      const items: any[] = [
        { type: 'header', label: targetWord, onSpeakClick: () => speakText(targetWord, currentSettings) },
        { type: 'divider', label: 'DIVIDER' }
      ];
      // Build search menu items for all enabled engines
      const iconSearchGoogle = '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>';
      const iconSearchX = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16z"/><path d="M20 4L4 20"/></svg>';
      const iconSearchReddit = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8c-4 0-8 2.5-8 6s4 6 8 6 8-2.5 8-6-4-6-8-6z"/><circle cx="8.5" cy="13" r="1" fill="currentColor"/><circle cx="15.5" cy="13" r="1" fill="currentColor"/><path d="M9 16.5c1 .8 2 1 3 1s2-.2 3-1"/><path d="M12 8V5"/><circle cx="15" cy="3" r="2"/><circle cx="3.5" cy="10.5" r="1.5"/><circle cx="20.5" cy="10.5" r="1.5"/></svg>';
      const iconCustomSearch = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

      if (currentSettings?.enableSearchGoogle) {
        items.push({ icon: iconSearchGoogle, label: '搜索 Google', onClick: () => window.open(`https://www.google.com/search?q=${encodeURIComponent(targetWord)}`, '_blank') });
      }
      if (currentSettings?.enableSearchX) {
        items.push({ icon: iconSearchX, label: '搜索 X (Twitter)', onClick: () => window.open(`https://x.com/search?q=${encodeURIComponent(`"${targetWord}"`)}`, '_blank') });
      }
      if (currentSettings?.enableSearchReddit) {
        items.push({ icon: iconSearchReddit, label: '搜索 Reddit', onClick: () => window.open(`https://www.reddit.com/search/?q=${encodeURIComponent(targetWord)}`, '_blank') });
      }
      if (currentSettings?.customSearchEngines?.length) {
        for (const engine of currentSettings.customSearchEngines) {
          if (engine.enabled && engine.name && engine.urlTemplate) {
            const url = engine.urlTemplate.replace(/\{query\}/g, encodeURIComponent(targetWord));
            items.push({ icon: iconCustomSearch, label: engine.name, onClick: () => window.open(url, '_blank') });
          }
        }
      }
      if (items.length > 2) { // more than just header + divider
        items.push({ type: 'divider', label: 'DIVIDER' });
      }
      items.push({ icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) });
      uiActions.showContextMenu(items, clientX, clientY);
    } else {
      const items: any[] = [
        { type: 'header', label: 'No text detected' },
        { type: 'divider', label: 'DIVIDER' },
      ];
      if (altText && altText !== '图片没有可用描述') {
        items.push({ icon: SVG_ICONS.speak, label: altText, onClick: () => speakText(altText, currentSettings) });
        items.push({ type: 'divider', label: 'DIVIDER' });
      }
      items.push({ icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) });
      uiActions.showContextMenu(items, clientX, clientY);
    }
  } catch (err) {
    const items: any[] = [];
    if (altText && altText !== '图片没有可用描述') {
      items.push({ type: 'header', label: altText, onSpeakClick: () => speakText(altText, currentSettings) });
    } else {
      items.push({ type: 'header', label: 'OCR failed' });
    }
    items.push({ type: 'divider', label: 'DIVIDER' });
    items.push({ icon: SVG_ICONS.settings, label: '设置', onClick: () => safeSendMessage({ type: 'OPEN_OPTIONS' }) });
    uiActions.showContextMenu(items, clientX, clientY);
  }
}
