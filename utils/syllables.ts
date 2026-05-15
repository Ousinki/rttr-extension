// @ts-ignore
import Hypher from 'hypher';
// @ts-ignore
import english from 'hyphenation.en-us';

const h = new Hypher(english);

/**
 * Splits an English word into syllables.
 * Example: "unpunished" -> ["un", "pun", "ished"]
 * If the word contains non-alphabetic characters or is too short, it may return the original word.
 */
export function syllabify(word: string): string[] {
  // hypher returns an array of syllables
  return h.hyphenate(word);
}

/**
 * Returns a syllabified string joined by the specified separator (default is middle dot).
 * Example: "unpunished" -> "un·pun·ished"
 * Hyphenated words are split by hyphen, syllabified individually, and rejoined.
 */
export function syllabifyText(word: string, separator: string = '·'): string {
  if (word.includes('-')) {
    return word.split('-').map(part => {
      // Don't syllabify empty parts
      if (!part) return '';
      return h.hyphenate(part).join(separator);
    }).join('-');
  }
  return h.hyphenate(word).join(separator);
}
