import { trimMatchedExcerpt } from './controlledContextTrim.js';

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

interface NormalizedParagraph {
  normalized: string;
  raw: string;
}

function collectParagraphs(content: string): NormalizedParagraph[] {
  return normalizeLineEndings(content)
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => ({
      normalized: normalizeText(raw),
      raw
    }))
    .filter((paragraph) => paragraph.normalized.length > 0);
}

function pushFragment(target: string[], seen: Set<string>, value: string) {
  const normalized = normalizeText(value);
  if (normalized.length < 4 || seen.has(normalized)) {
    return;
  }
  seen.add(normalized);
  target.push(normalized);
}

function collectDelimiterFragments(rawQuote: string) {
  const fragments: string[] = [];
  const seen = new Set<string>();
  const lines = normalizeLineEndings(rawQuote)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    pushFragment(fragments, seen, line);
    for (const sentence of line.split(/[。！？；]/)) {
      pushFragment(fragments, seen, sentence);
      for (const clause of sentence.split(/[：:]/)) {
        pushFragment(fragments, seen, clause);
        for (const phrase of clause.split(/[，,]/)) {
          pushFragment(fragments, seen, phrase);
          for (const part of phrase.split(/[•✔❌]/)) {
            pushFragment(fragments, seen, part);
          }
        }
      }
    }
  }

  return fragments;
}

function collectSlidingWindowFragments(units: string[], joiner: string) {
  const fragments: string[] = [];
  const seen = new Set<string>();
  for (let windowSize = units.length; windowSize >= 1; windowSize -= 1) {
    for (let start = 0; start + windowSize <= units.length; start += 1) {
      pushFragment(fragments, seen, units.slice(start, start + windowSize).join(joiner));
    }
  }
  return fragments;
}

function collectWordWindowFragments(normalizedQuote: string) {
  const words = normalizedQuote.split(' ').filter(Boolean);
  return words.length > 1 ? collectSlidingWindowFragments(words, ' ') : [];
}

function collectCharacterWindowFragments(normalizedQuote: string) {
  const characters = Array.from(normalizedQuote.replace(/\s+/g, ''));
  return characters.length > 1 ? collectSlidingWindowFragments(characters, '') : [];
}

function collectSearchFragments(rawQuote: string) {
  const normalizedQuote = normalizeText(rawQuote);
  const fragments = [
    ...collectDelimiterFragments(rawQuote),
    ...collectWordWindowFragments(normalizedQuote),
    ...collectCharacterWindowFragments(normalizedQuote)
  ];
  return Array.from(new Set(fragments)).sort((left, right) => right.length - left.length);
}

function findParagraphIndexesContaining(paragraphs: NormalizedParagraph[], fragment: string) {
  const indexes: number[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (paragraph.normalized.includes(fragment)) {
      indexes.push(index);
    }
  });
  return indexes;
}

function joinParagraphRange(paragraphs: NormalizedParagraph[], startIndex: number, endIndex: number) {
  return paragraphs
    .slice(startIndex, endIndex + 1)
    .map((paragraph) => paragraph.raw)
    .join('\n\n')
    .trim();
}

function findExactParagraphMatch(paragraphs: NormalizedParagraph[], normalizedQuote: string) {
  if (!normalizedQuote) {
    return null;
  }
  const indexes = findParagraphIndexesContaining(paragraphs, normalizedQuote);
  return indexes.length === 1 ? paragraphs[indexes[0]].raw : null;
}

function findUniqueFragmentParagraph(paragraphs: NormalizedParagraph[], fragments: string[]) {
  for (const fragment of fragments) {
    const indexes = findParagraphIndexesContaining(paragraphs, fragment);
    if (indexes.length === 1) {
      return {
        anchorFragment: fragment,
        raw: paragraphs[indexes[0]].raw
      };
    }
  }
  return null;
}

function findNearbyFragmentRange(paragraphs: NormalizedParagraph[], fragments: string[]) {
  const candidates = fragments
    .map((fragment) => ({
      fragment,
      indexes: findParagraphIndexesContaining(paragraphs, fragment)
    }))
    .filter((candidate) => candidate.indexes.length > 1 && candidate.indexes.length <= 12);

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      const matches: Array<{ start: number; end: number }> = [];
      for (const start of left.indexes) {
        for (const end of right.indexes) {
          if (Math.abs(end - start) > 1) {
            continue;
          }
          matches.push({
            start: Math.min(start, end),
            end: Math.max(start, end)
          });
          if (matches.length > 1) {
            break;
          }
        }
        if (matches.length > 1) {
          break;
        }
      }
      if (matches.length === 1) {
        return {
          anchorFragment: left.fragment,
          raw: joinParagraphRange(paragraphs, matches[0].start, matches[0].end)
        };
      }
    }
  }
  return null;
}

export function findContextExcerpt(content: string, quote: string) {
  const normalizedQuote = normalizeText(quote);
  if (!normalizedQuote) {
    return null;
  }

  const paragraphs = collectParagraphs(content);
  const exactMatch = findExactParagraphMatch(paragraphs, normalizedQuote);
  if (exactMatch) {
    return trimMatchedExcerpt(exactMatch, quote, normalizedQuote);
  }

  const fragments = collectSearchFragments(quote);
  const uniqueFragmentMatch = findUniqueFragmentParagraph(paragraphs, fragments);
  if (uniqueFragmentMatch) {
    return trimMatchedExcerpt(uniqueFragmentMatch.raw, quote, uniqueFragmentMatch.anchorFragment);
  }

  const nearbyFragmentRange = findNearbyFragmentRange(paragraphs, fragments);
  return nearbyFragmentRange
    ? trimMatchedExcerpt(nearbyFragmentRange.raw, quote, nearbyFragmentRange.anchorFragment)
    : null;
}
