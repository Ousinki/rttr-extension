/**
 * Bilibili Study Companion Subtitle and MDX Notes Parser
 * 负责解析 .srt 字幕文件及带有关联时间戳和富文本样式的 .mdx 学习包文档
 */

export interface SubtitleWord {
  text: string;
  isWord: boolean;
  color?: string;
  ruby?: string;
  bold?: boolean;
}

export interface SubtitleEntry {
  start: number; // 开始时间 (秒)
  end: number;   // 结束时间 (秒)
  en: string;
  zh: string;
  wordsEn: SubtitleWord[]; // 英文切词后的富文本交互单元
}

export interface StudyNote {
  timestamp: number; // 触发秒数
  title: string;
  content: string; // Markdown 正文内容
}

export interface BiliStudyPackage {
  title: string;
  bvid?: string;
  youtubeId?: string;
  subtitles: SubtitleEntry[];
  notes: StudyNote[];
}

/**
 * 辅助函数：将时间字符串 (如 "00:00:27,786" 或 "00:01:05.10") 转换为秒数
 */
export function timeToSeconds(timeStr: string): number {
  const cleaned = timeStr.trim().replace(',', '.'); // 统一毫秒分隔符
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    // mm:ss
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    return m * 60 + s;
  }
  return parseFloat(cleaned) || 0;
}

/**
 * 辅助函数：将多种格式的时间轴记号 (如 "[00:27.78]", "(27.7)", "27s") 提取并转换为秒数
 */
export function extractTimestamp(header: string): number | null {
  // 匹配 [mm:ss] 或 [hh:mm:ss]
  const bracketMatch = header.match(/\[([0-9:.,]+)\]/);
  if (bracketMatch) return timeToSeconds(bracketMatch[1]);

  // 匹配 (mm:ss) 或 (hh:mm:ss)
  const parenMatch = header.match(/\(([0-9:.,]+)\)/);
  if (parenMatch) return timeToSeconds(parenMatch[1]);

  // 匹配 纯数字+s (例如 27.5s)
  const secMatch = header.match(/([0-9.]+)\s*s/i);
  if (secMatch) return parseFloat(secMatch[1]);

  return null;
}

/**
 * 递归遍历 DOM 树，将富文本段落拆解为独立的 SubtitleWord 交互数组
 */
function parseHtmlToWords(
  node: Node,
  inherited: { color?: string; ruby?: string; bold?: boolean } = {}
): SubtitleWord[] {
  const words: SubtitleWord[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    // 使用正则按英文单词边界划分：保留 ' 和 - 作为单词一部分
    const tokens = text.split(/([a-zA-Z0-9'-]+)/g);

    for (const token of tokens) {
      if (!token) continue;
      const isWord = /^[a-zA-Z0-9'-]+$/.test(token);
      words.push({
        text: token,
        isWord,
        color: inherited.color,
        ruby: inherited.ruby,
        bold: inherited.bold,
      });
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const current = { ...inherited };

    // 识别自定义标签 <Highlight color="..." ruby="...">
    if (el.tagName.toLowerCase() === 'highlight') {
      const colorAttr = el.getAttribute('color');
      const rubyAttr = el.getAttribute('ruby');
      if (colorAttr) current.color = colorAttr;
      if (rubyAttr) current.ruby = rubyAttr;
    }
    // 识别标准 <font color="...">
    else if (el.tagName.toLowerCase() === 'font') {
      const colorAttr = el.getAttribute('color');
      if (colorAttr) current.color = colorAttr;
    }
    // 识别加粗 <b> 或 <strong>
    else if (el.tagName.toLowerCase() === 'b' || el.tagName.toLowerCase() === 'strong') {
      current.bold = true;
    }

    // 递归遍历子节点
    for (let i = 0; i < el.childNodes.length; i++) {
      words.push(...parseHtmlToWords(el.childNodes[i], current));
    }
  }

  return words;
}

/**
 * 核心方法 1：解析标准双语 .srt 字幕文件
 */
export function parseSrt(content: string): SubtitleEntry[] {
  const blocks = content.trim().split(/\n\s*\n/);
  const entries: SubtitleEntry[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    // 寻找时间轴行 (如 "00:00:27,786 --> 00:00:31,660")
    const timeIndex = lines.findIndex(l => l.includes('-->'));
    if (timeIndex === -1) continue;

    const times = lines[timeIndex].split(' --> ');
    if (times.length < 2) continue;

    const start = timeToSeconds(times[0]);
    const end = timeToSeconds(times[1]);

    // 合并时间轴之后的文本行。如果是双语，前部分通常是英文，后部分是中文
    const textLines = lines.slice(timeIndex + 1);
    let en = textLines[0] || '';
    let zh = textLines[1] || '';

    // 若无第二行，且包含中文字符，将单行视为中文
    if (!zh && /[\u4e00-\u9fa5]/.test(en)) {
      zh = en;
      en = '';
    }

    // 构建 interactive words 列表
    let wordsEn: SubtitleWord[] = [];
    if (en) {
      try {
        const domParser = new DOMParser();
        const doc = domParser.parseFromString(`<div>${en}</div>`, 'text/html');
        wordsEn = parseHtmlToWords(doc.body.firstChild || doc.body);
      } catch (e) {
        // Fallback: 纯文本切分
        const tokens = en.split(/([a-zA-Z0-9'-]+)/g);
        wordsEn = tokens.filter(Boolean).map(token => ({
          text: token,
          isWord: /^[a-zA-Z0-9'-]+$/.test(token)
        }));
      }
    }

    entries.push({ start, end, en, zh, wordsEn });
  }

  return entries.sort((a, b) => a.start - b.start);
}

/**
 * 核心方法 2：解析 Next.js 兼容的一源双端 .mdx 学习包
 */
export function parseMdx(content: string): BiliStudyPackage {
  const result: BiliStudyPackage = {
    title: '未定义标题',
    subtitles: [],
    notes: [],
  };

  // 1. 解析 Frontmatter 元数据
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatterMatch) {
    const fmText = frontmatterMatch[1];
    const fmTitle = fmText.match(/title:\s*["']?([^"\n\r']*)["']?/);
    const fmBvid = fmText.match(/bilibili_id:\s*["']?([^"\n\r']*)["']?/);
    const fmYt = fmText.match(/youtube_id:\s*["']?([^"\n\r']*)["']?/);

    if (fmTitle) result.title = fmTitle[1];
    if (fmBvid) result.bvid = fmBvid[1];
    if (fmYt) result.youtubeId = fmYt[1];
  }

  // 2. 解析 <T t={seconds}> 字幕标签
  // 匹配形式：<T t={12.34} className="...">文本</T> 或简易的 <T t={12}>文本</T>
  const subtitleRegex = /<T\s+t=\{([0-9.]+)\}(?:\s+className=["']([^"']+)["'])?>([\s\S]*?)<\/T>/g;
  let match;
  const tempSubtitlesMap = new Map<number, { en: string; zh: string }>();

  while ((match = subtitleRegex.exec(content)) !== null) {
    const time = parseFloat(match[1]);
    const className = match[2] || '';
    const rawText = match[3].trim();

    // 还原 HTML 转义符 (srt_to_mdx 曾把 < 和 > 编码了)
    const text = rawText
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');

    const isWeakened = className.includes('weakened-text') || className.includes('zh') || /[\u4e00-\u9fa5]/.test(text);

    if (!tempSubtitlesMap.has(time)) {
      tempSubtitlesMap.set(time, { en: '', zh: '' });
    }

    const current = tempSubtitlesMap.get(time)!;
    if (isWeakened) {
      current.zh = text;
    } else {
      current.en = text;
    }
  }

  // 将合并后的字幕数据转换为 SubtitleEntry，估算结束时间 (默认以当前行与下一行的时间差，最大 6 秒)
  const times = Array.from(tempSubtitlesMap.keys()).sort((a, b) => a - b);
  const domParser = new DOMParser();

  for (let i = 0; i < times.length; i++) {
    const start = times[i];
    const nextStart = times[i + 1];
    // 默认字幕显示时间上限 5.5 秒，或者为下一行开始的时刻
    const end = nextStart ? Math.min(start + 5.5, nextStart) : start + 4.5;
    const { en, zh } = tempSubtitlesMap.get(start)!;

    let wordsEn: SubtitleWord[] = [];
    if (en) {
      try {
        const doc = domParser.parseFromString(`<div>${en}</div>`, 'text/html');
        wordsEn = parseHtmlToWords(doc.body.firstChild || doc.body);
      } catch (e) {
        const tokens = en.split(/([a-zA-Z0-9'-]+)/g);
        wordsEn = tokens.filter(Boolean).map(token => ({
          text: token,
          isWord: /^[a-zA-Z0-9'-]+$/.test(token)
        }));
      }
    }

    result.subtitles.push({ start, end, en, zh, wordsEn });
  }

  // 3. 解析 ### [时间戳] 带有时间轴定位的 Markdown 精读讲义
  // 匹配形式：三级或四级标题中带有类似 [00:27.78] 或 (27s) 标记的节点
  const noteSectionRegex = /^(?:###|####)\s+([^\r\n]+)\r?\n([\s\S]*?)(?=\n(?:###|####)\s+|\n##\s+|\n---\s*|$)/gm;
  let noteMatch;

  while ((noteMatch = noteSectionRegex.exec(content)) !== null) {
    const title = noteMatch[1].trim();
    const noteContent = noteMatch[2].trim();
    const timestamp = extractTimestamp(title);

    if (timestamp !== null) {
      result.notes.push({
        timestamp,
        title,
        content: noteContent,
      });
    }
  }

  // 排序讲义
  result.notes.sort((a, b) => a.timestamp - b.timestamp);

  return result;
}
