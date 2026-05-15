const ESCAPABLE_MARKDOWN_CHARACTERS = new Set([
  '!',
  '"',
  '#',
  '$',
  '%',
  '&',
  "'",
  '(',
  ')',
  '*',
  '+',
  ',',
  '-',
  '.',
  '/',
  ':',
  ';',
  '<',
  '=',
  '>',
  '?',
  '@',
  '[',
  '\\',
  ']',
  '^',
  '_',
  '`',
  '{',
  '|',
  '}',
  '~'
]);

function isEscapableMarkdownCharacter(character: string) {
  return ESCAPABLE_MARKDOWN_CHARACTERS.has(character);
}

function hasUrlSchemePrefix(value: string) {
  const colonIndex = value.indexOf(':');
  if (colonIndex <= 0) return false;
  const firstCharacter = value[0] ?? '';
  if (!isAsciiLetter(firstCharacter)) return false;

  for (let index = 1; index < colonIndex; index += 1) {
    const character = value[index] ?? '';
    if (!isAsciiLetter(character) && !isAsciiDigit(character) && character !== '+' && character !== '-' && character !== '.') {
      return false;
    }
  }

  return true;
}

function isAsciiDigit(character: string) {
  const code = character.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isAsciiLetter(character: string) {
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

export function collectMarkdownEscapedRanges(text: string, offset = 0) {
  const ranges: Array<{ from: number; to: number }> = [];

  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] !== '\\') continue;
    const escapedCharacter = text[index + 1] ?? '';
    if (!isEscapableMarkdownCharacter(escapedCharacter)) continue;
    ranges.push({ from: offset + index, to: offset + index + 1 });
    index += 1;
  }

  return ranges;
}

export function isSafeMarkdownLinkHref(href: string) {
  const normalized = normalizeMarkdownLinkDestination(href).toLowerCase();
  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('mailto:')) {
    return true;
  }
  return !hasUrlSchemePrefix(normalized);
}

export function normalizeMarkdownLinkDestination(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const opening = trimmed[0];
  const closing = trimmed[trimmed.length - 1];
  if ((opening === '<' && closing === '>') || (opening === '"' && closing === '"') || (opening === '\'' && closing === '\'')) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function projectMarkdownEscapedText(text: string) {
  let projected = '';

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (character === '\\') {
      const escapedCharacter = text[index + 1] ?? '';
      if (isEscapableMarkdownCharacter(escapedCharacter)) {
        projected += escapedCharacter;
        index += 1;
        continue;
      }
    }
    projected += character;
  }

  return projected;
}
