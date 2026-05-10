/**
 * Number Unit Conversion
 * 将英文数字计量 (100 million, 5 billion) 转换为中文计量 (1亿, 50亿)
 * 支持整数、小数、逗号分隔数字以及英文数词 (one, two, five...)
 */

// 英文数词映射
const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100,
};

// 单位倍数
const UNIT_MULTIPLIERS: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  trillion: 1_000_000_000_000,
};

export interface NumberAnnotation {
  start: number;  // 在段落文本中的起始位置
  end: number;    // 在段落文本中的结束位置
  original: string;   // 原文 (如 "100 million")
  converted: string;  // 转换后 (如 "1亿")
}

/**
 * 将绝对数值格式化为中文计量单位
 */
function formatChinese(value: number): string {
  if (value === 0) return '0';

  const absVal = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absVal >= 1_0000_0000_0000) {
    // 万亿
    const wan_yi = absVal / 1_0000_0000_0000;
    return sign + formatNum(wan_yi) + '万亿';
  } else if (absVal >= 1_0000_0000) {
    // 亿
    const yi = absVal / 1_0000_0000;
    return sign + formatNum(yi) + '亿';
  } else if (absVal >= 1_0000) {
    // 万
    const wan = absVal / 1_0000;
    return sign + formatNum(wan) + '万';
  } else if (absVal >= 1000) {
    // 千
    return sign + formatNum(absVal);
  }
  return sign + String(absVal);
}

/**
 * 格式化数字，去掉不必要的小数
 */
function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // 最多保留 2 位小数
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, '');
}

/**
 * 解析数字文本 (支持 "100", "1,000", "3.5", "1.2" 等)
 */
function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * 扫描段落文本，找出所有「数字 + 单位」的组合
 * 例如 "100 million", "5 billion", "3.5 thousand", "five billion"
 */
export function findNumberConversions(text: string): NumberAnnotation[] {
  const results: NumberAnnotation[] = [];

  // Pattern 1: 数字 + 单位 (如 "100 million", "3.5 billion", "1,000 trillion")
  const numericPattern = /(\d[\d,]*\.?\d*)\s+(hundred|thousand|million|billion|trillion)/gi;
  let match;
  while ((match = numericPattern.exec(text)) !== null) {
    const numStr = match[1];
    const unit = match[2].toLowerCase();
    const num = parseNumber(numStr);
    if (num === null) continue;

    const value = num * UNIT_MULTIPLIERS[unit];
    const converted = formatChinese(value);
    if (converted) {
      results.push({
        start: match.index,
        end: match.index + match[0].length,
        original: match[0],
        converted,
      });
    }
  }

  // Pattern 2: 英文数词 + 单位 (如 "five billion", "twenty million")
  const wordPattern = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\s+(hundred|thousand|million|billion|trillion)\b/gi;
  while ((match = wordPattern.exec(text)) !== null) {
    // Skip if already covered by a numeric match
    const overlapExists = results.some(r =>
      match!.index >= r.start && match!.index < r.end
    );
    if (overlapExists) continue;

    const wordNum = WORD_NUMBERS[match[1].toLowerCase()];
    const unit = match[2].toLowerCase();
    if (wordNum === undefined) continue;

    const value = wordNum * UNIT_MULTIPLIERS[unit];
    const converted = formatChinese(value);
    if (converted) {
      results.push({
        start: match.index,
        end: match.index + match[0].length,
        original: match[0],
        converted,
      });
    }
  }

  // Sort by position
  results.sort((a, b) => a.start - b.start);
  return results;
}
