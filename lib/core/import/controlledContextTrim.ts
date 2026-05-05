function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

function stripMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)]]/g, '$2')
    .replace(/\[\[([^\]]+)]]/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[|`*_>#]/g, ' ');
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string) {
  return compactWhitespace(stripMarkdown(normalizeLineEndings(value)));
}

function findAllIndexes(content: string, fragment: string) {
  const indexes: number[] = [];
  let startIndex = 0;
  while (true) {
    const index = content.indexOf(fragment, startIndex);
    if (index < 0) {
      return indexes;
    }
    indexes.push(index);
    startIndex = index + 1;
  }
}

function collectBoundaryFragments(quote: string) {
  return normalizeLineEndings(quote)
    .split(/[\s。！？；：:，,•✔❌]+/)
    .map((fragment) => normalizeText(fragment))
    .filter((fragment) => fragment.length > 0);
}

function collectLineRanges(rawExcerpt: string) {
  const lines = normalizeLineEndings(rawExcerpt).split('\n');
  const ranges: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  lines.forEach((line, index) => {
    const normalized = normalizeText(line);
    if (normalized.length > 0) {
      ranges.push({ from: cursor, to: cursor + normalized.length - 1 });
      cursor += normalized.length;
      if (index < lines.length - 1) {
        cursor += 1;
      }
      return;
    }
    if (index < lines.length - 1 && cursor > 0) {
      cursor += 1;
    }
    ranges.push({ from: cursor, to: cursor - 1 });
  });
  return { lines, ranges };
}

function resolveLineIndex(position: number, ranges: Array<{ from: number; to: number }>) {
  return ranges.findIndex((range) => range.to >= range.from && position >= range.from && position <= range.to);
}

function resolveDirectionalBoundary(input: {
  excerpt: string;
  fragment: string;
  expected: number;
  direction: 'backward' | 'forward';
}) {
  const matches = findAllIndexes(input.excerpt, input.fragment);
  if (matches.length === 0) {
    return null;
  }
  const expected = input.expected;
  const eligible = matches.filter((match) => (input.direction === 'backward' ? match <= expected : match >= expected));
  const pool = eligible.length > 0 ? eligible : matches;
  return pool.reduce((best, current) => {
    if (best === null) {
      return current;
    }
    const bestDistance = Math.abs(best - expected);
    const currentDistance = Math.abs(current - expected);
    if (currentDistance !== bestDistance) {
      return currentDistance < bestDistance ? current : best;
    }
    if (input.direction === 'backward') {
      return current > best ? current : best;
    }
    return current < best ? current : best;
  }, null as number | null);
}

export function trimMatchedExcerpt(rawExcerpt: string, quote: string, anchorFragment: string) {
  const normalizedExcerpt = normalizeText(rawExcerpt);
  const normalizedQuote = normalizeText(quote);
  const normalizedAnchor = normalizeText(anchorFragment);
  if (!normalizedExcerpt || !normalizedQuote || !normalizedAnchor) {
    return rawExcerpt.trim();
  }

  const orderedFragments = collectBoundaryFragments(quote);
  const firstFragment = orderedFragments.find((fragment) => normalizedQuote.includes(fragment));
  const lastFragment = [...orderedFragments].reverse().find((fragment) => normalizedQuote.includes(fragment));
  if (!firstFragment || !lastFragment) {
    return rawExcerpt.trim();
  }

  const quoteAnchorIndex = normalizedQuote.indexOf(normalizedAnchor);
  const excerptAnchorIndex = normalizedExcerpt.indexOf(normalizedAnchor);
  const quoteHeadIndex = normalizedQuote.indexOf(firstFragment);
  const quoteTailIndex = normalizedQuote.lastIndexOf(lastFragment);
  if (quoteAnchorIndex < 0 || excerptAnchorIndex < 0 || quoteHeadIndex < 0 || quoteTailIndex < 0) {
    return rawExcerpt.trim();
  }

  const expectedHeadIndex = excerptAnchorIndex - (quoteAnchorIndex - quoteHeadIndex);
  const expectedTailIndex = excerptAnchorIndex + (quoteTailIndex - quoteAnchorIndex);
  const headIndex = resolveDirectionalBoundary({
    excerpt: normalizedExcerpt,
    fragment: firstFragment,
    expected: expectedHeadIndex,
    direction: 'backward'
  });
  const tailIndex = resolveDirectionalBoundary({
    excerpt: normalizedExcerpt,
    fragment: lastFragment,
    expected: expectedTailIndex,
    direction: 'forward'
  });
  if (headIndex === null || tailIndex === null || headIndex > tailIndex) {
    return rawExcerpt.trim();
  }

  const { lines, ranges } = collectLineRanges(rawExcerpt);
  const startLineIndex = resolveLineIndex(headIndex, ranges);
  const endLineIndex = resolveLineIndex(tailIndex + lastFragment.length - 1, ranges);
  if (startLineIndex < 0 || endLineIndex < 0 || startLineIndex > endLineIndex) {
    return rawExcerpt.trim();
  }
  return lines.slice(startLineIndex, endLineIndex + 1).join('\n').trim();
}
