export function getNumberReading(value: string): string {
  const clean = value.replace(/^\[|\]$/g, '').replace(/,/g, '').trim();

  const currencyMatch = clean.match(/^([£$€¥])\s?(.*)$/);
  if (currencyMatch) {
    const symbol = currencyMatch[1];
    const rest = currencyMatch[2];
    const currencyNamePlural: Record<string, string> = {
      '£': 'pounds',
      '$': 'dollars',
      '€': 'euros',
      '¥': 'yen'
    };
    const currencyNameSingular: Record<string, string> = {
      '£': 'pound',
      '$': 'dollar',
      '€': 'euro',
      '¥': 'yen'
    };
    
    const restUnitMatch = rest.match(/^(.+?)\s+([A-Za-z%]+)$/);
    if (restUnitMatch) {
      const cName = currencyNameSingular[symbol] || '';
      return `${getNumberReading(restUnitMatch[1])} ${cName} ${restUnitMatch[2]}`.trim();
    }
    
    const cName = currencyNamePlural[symbol] || '';
    return `${getNumberReading(rest)} ${cName}`.trim();
  }

  const unitMatch = clean.match(/^(.+?)\s+([A-Za-z%]+)$/);
  if (unitMatch) {
    return `${getNumberReading(unitMatch[1])} ${unitMatch[2]}`;
  }
  if (clean.includes('.') && clean.split('.').length > 2) {
    return clean.split('.').map(readIntegerLike).join(' dot ');
  }
  if (/^\d{4}$/.test(clean)) {
    const year = Number(clean);
    if (year >= 1000 && year <= 2099) {
      return readYear(year);
    }
  }
  if (clean.includes('.')) {
    const [integer, decimal] = clean.split('.');
    return `${readIntegerLike(integer)} point ${decimal.split('').map(readDigit).join(' ')}`;
  }
  return readIntegerLike(clean);
}

export function isNumberLikeText(value: string): boolean {
  return /^(?:\[\d+\]|[£$€¥]?\s?\d+(?:,\d{3})*(?:\.\d+)*(?:\s?(?:days?|years?|months?|percent|%))?)$/i.test(value.trim());
}

function readYear(year: number): string {
  if (year >= 2000 && year <= 2009) return `two thousand ${year === 2000 ? '' : readIntegerLike(String(year - 2000))}`.trim();
  if (year >= 2010 && year <= 2099) return `twenty ${readIntegerLike(String(year - 2000))}`;
  const first = Math.floor(year / 100);
  const last = year % 100;
  return `${readIntegerLike(String(first))} ${last === 0 ? 'hundred' : readIntegerLike(String(last))}`;
}

function readIntegerLike(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value.split('').map(readDigit).join(' ');
  if (number === 0) return 'zero';
  if (number < 20) return [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen',
  ][number];
  if (number < 100) {
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const rest = number % 10;
    return `${tens[Math.floor(number / 10)]}${rest ? ` ${readIntegerLike(String(rest))}` : ''}`;
  }
  if (number < 1000) {
    const rest = number % 100;
    return `${readIntegerLike(String(Math.floor(number / 100)))} hundred${rest ? ` ${readIntegerLike(String(rest))}` : ''}`;
  }
  if (number < 1000000) {
    const rest = number % 1000;
    return `${readIntegerLike(String(Math.floor(number / 1000)))} thousand${rest ? ` ${readIntegerLike(String(rest))}` : ''}`;
  }
  return value.split('').map(readDigit).join(' ');
}

function readDigit(digit: string): string {
  return {
    '0': 'zero',
    '1': 'one',
    '2': 'two',
    '3': 'three',
    '4': 'four',
    '5': 'five',
    '6': 'six',
    '7': 'seven',
    '8': 'eight',
    '9': 'nine',
  }[digit] || digit;
}
