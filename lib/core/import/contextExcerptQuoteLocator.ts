function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

const MAX_FRAGMENT_MATCHERS = 160;
const MAX_MATCHER_TEXT_LENGTH = 320;
const MAX_WINDOW_STARTS_PER_SIZE = 8;

function stripQuoteMarkdown(value: string) {
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

function normalizeQuoteText(value: string) {
  return compactWhitespace(stripQuoteMarkdown(normalizeLineEndings(value)));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createLooseMatcher(fragment: string) {
  const normalized = compactWhitespace(fragment);
  if (!normalized || normalized.length > MAX_MATCHER_TEXT_LENGTH) {
    return null;
  }
  const parts = normalized.split(' ').map((part) => escapeRegex(part));
  const source = parts.length <= 1 ? parts[0] : parts.join('[\\s\\p{P}\\p{S}]+');
  return new RegExp(source, 'u');
}

function pushFragment(target: string[], seen: Set<string>, value: string) {
  if (target.length >= MAX_FRAGMENT_MATCHERS) {
    return false;
  }
  const normalized = normalizeQuoteText(value);
  if (normalized.length < 4 || normalized.length > MAX_MATCHER_TEXT_LENGTH || seen.has(normalized)) {
    return true;
  }
  seen.add(normalized);
  target.push(normalized);
  return target.length < MAX_FRAGMENT_MATCHERS;
}

function pushFragmentByBounds(target: string[], seen: Set<string>, units: string[], joiner: string, start: number, length: number) {
  if (length <= 0 || start < 0 || start + length > units.length) {
    return true;
  }
  return pushFragment(target, seen, units.slice(start, start + length).join(joiner));
}

function collectDelimiterFragments(rawQuote: string, fragments: string[], seen: Set<string>) {
  const lines = normalizeLineEndings(rawQuote)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!pushFragment(fragments, seen, line)) {
      return;
    }
    for (const sentence of line.split(/[。！？；]/)) {
      if (!pushFragment(fragments, seen, sentence)) {
        return;
      }
      for (const clause of sentence.split(/[：:]/)) {
        if (!pushFragment(fragments, seen, clause)) {
          return;
        }
        for (const phrase of clause.split(/[，,]/)) {
          if (!pushFragment(fragments, seen, phrase)) {
            return;
          }
          for (const part of phrase.split(/[•✔❌]/)) {
            if (!pushFragment(fragments, seen, part)) {
              return;
            }
          }
        }
      }
    }
  }
}

function uniqueDescending(values: number[]) {
  const unique = Array.from(new Set(values.filter((value) => value >= 1)));
  return unique.sort((left, right) => right - left);
}

function collectWindowSizes(totalUnits: number, mode: 'word' | 'char') {
  if (totalUnits <= 1) {
    return [];
  }

  if (mode === 'word') {
    const capped = Math.min(totalUnits, 24);
    return uniqueDescending([capped, capped - 1, Math.ceil(capped * 0.85), Math.ceil(capped * 0.66), 12, 10, 8, 6, 4, 3, 2]);
  }

  const capped = Math.min(totalUnits, 96);
  return uniqueDescending([capped, capped - 1, Math.ceil(capped * 0.85), Math.ceil(capped * 0.66), 48, 36, 24, 18, 12, 8, 6, 4]);
}

function collectSampledWindowFragments(
  units: string[],
  joiner: string,
  mode: 'word' | 'char',
  fragments: string[],
  seen: Set<string>
) {
  const totalUnits = units.length;
  const sizes = collectWindowSizes(totalUnits, mode);

  for (const windowSize of sizes) {
    const maxStart = totalUnits - windowSize;
    if (maxStart < 0) {
      continue;
    }
    if (!pushFragmentByBounds(fragments, seen, units, joiner, 0, windowSize)) {
      return;
    }
    if (!pushFragmentByBounds(fragments, seen, units, joiner, maxStart, windowSize)) {
      return;
    }
    if (!pushFragmentByBounds(fragments, seen, units, joiner, Math.floor(maxStart / 2), windowSize)) {
      return;
    }

    const slots = Math.min(MAX_WINDOW_STARTS_PER_SIZE, maxStart + 1);
    for (let slot = 0; slot < slots; slot += 1) {
      const ratio = slots <= 1 ? 0 : slot / (slots - 1);
      const start = Math.round(maxStart * ratio);
      if (!pushFragmentByBounds(fragments, seen, units, joiner, start, windowSize)) {
        return;
      }
    }
  }
}

function collectSearchFragments(rawQuote: string) {
  const fragments: string[] = [];
  const seen = new Set<string>();
  collectDelimiterFragments(rawQuote, fragments, seen);

  if (fragments.length < MAX_FRAGMENT_MATCHERS) {
    const normalizedQuote = normalizeQuoteText(rawQuote);
    const words = normalizedQuote.split(' ').filter(Boolean);
    if (words.length > 1) {
      collectSampledWindowFragments(words, ' ', 'word', fragments, seen);
    }

    if (fragments.length < MAX_FRAGMENT_MATCHERS) {
      const chars = Array.from(normalizedQuote.replace(/\s+/g, ''));
      if (chars.length > 1) {
        collectSampledWindowFragments(chars, '', 'char', fragments, seen);
      }
    }
  }

  return fragments.sort((left, right) => right.length - left.length);
}

export interface ContextExcerptQuoteLocator {
  normalizedQuote: string;
  exactMatcher: RegExp | null;
  fragmentMatchers: Array<{ fragment: string; matcher: RegExp }>;
}

export function createContextExcerptQuoteLocator(quote: string): ContextExcerptQuoteLocator | null {
  const normalizedQuote = normalizeQuoteText(quote);
  if (!normalizedQuote) {
    return null;
  }
  const exactMatcher = createLooseMatcher(normalizedQuote);
  const fragmentMatchers = collectSearchFragments(quote)
    .map((fragment) => ({ fragment, matcher: createLooseMatcher(fragment) }))
    .filter((entry): entry is { fragment: string; matcher: RegExp } => Boolean(entry.matcher));
  return { exactMatcher, fragmentMatchers, normalizedQuote };
}

export { normalizeLineEndings };
