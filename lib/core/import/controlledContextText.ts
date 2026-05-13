export function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

export function normalizeLooseWhitespaceWithMap(value: string) {
  const raw = normalizeLineEndings(value);
  let normalized = '';
  const rawIndexes: number[] = [];
  let pendingWhitespaceStart: number | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === undefined) {
      continue;
    }
    if (/\s/.test(character)) {
      if (pendingWhitespaceStart === null) {
        pendingWhitespaceStart = index;
      }
      continue;
    }

    if (pendingWhitespaceStart !== null && normalized.length > 0) {
      normalized += ' ';
      rawIndexes.push(pendingWhitespaceStart);
      pendingWhitespaceStart = null;
    }

    normalized += character;
    rawIndexes.push(index);
  }

  return { normalized: normalized.trim(), raw, rawIndexes };
}

function stripMarkdown(value: string) {
  return value
    .replace(/\\([\\`*_{}[\]()#+.!<>|-])/g, '$1')
    .replace(/<([^>\s]+)>/g, ' $1 ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)]]/g, '$2')
    .replace(/\[\[([^\]]+)]]/g, '$1')
    .replace(/\[]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/(^|\s)•\s+/g, '$1')
    .replace(/[|`*_>#]/g, ' ');
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeText(value: string) {
  return compactWhitespace(stripMarkdown(normalizeLineEndings(value)));
}

export function collectBoundaryFragments(quote: string) {
  return normalizeLineEndings(quote)
    .split(/[\s。！？；：:，,•✔❌]+/)
    .map((fragment) => normalizeText(fragment))
    .filter((fragment) => fragment.length > 0);
}
