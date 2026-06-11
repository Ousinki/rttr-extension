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
      if (currentSettings?.enableSearchX) {
        items.push({
          icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16z"/><path d="M20 4L4 20"/></svg>',
          label: '搜索 X (Twitter)',
          onClick: () => {
            window.open(`https://x.com/search?q=${encodeURIComponent(`"${targetWord}"`)}`, '_blank');
          }
        });
      }
      if (currentSettings?.enableSearchReddit) {
        items.push({
          icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8c-2.5 0-5 1.5-5 4s2.5 4 5 4 5-1.5 5-4-2.5-4-5-4z"/><circle cx="9" cy="11.5" r="1" fill="currentColor"/><circle cx="15" cy="11.5" r="1" fill="currentColor"/><path d="M9.5 14.5c.8.8 2.2 1 2.5 1s1.7-.2 2.5-1"/></svg>',
          label: '搜索 Reddit',
          onClick: () => {
            window.open(`https://www.reddit.com/search/?q=${encodeURIComponent(targetWord)}`, '_blank');
          }
        });
      }
      if (currentSettings?.enableSearchX || currentSettings?.enableSearchReddit) {
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
