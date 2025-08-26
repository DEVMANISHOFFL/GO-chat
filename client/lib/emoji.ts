// src/lib/emoji.ts
const VS15 = '\uFE0E';
const VS16 = '\uFE0F';
const ZWJ = '\u200D';
const ZWNJ = '\u200C';
const SKIN_TONE_RE = /[\u{1F3FB}-\u{1F3FF}]/u;

export function normalizeEmoji(e: string): string {
  if (!e) return '';
  return e
    .trim()
    .replace(new RegExp(`[${VS15}${VS16}${ZWJ}${ZWNJ}]`, 'g'), '')
    .replace(SKIN_TONE_RE, '');
}
