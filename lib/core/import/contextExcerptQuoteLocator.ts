import { normalizeChineseVariants } from './chineseVariantNormalization.js';

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

const MAX_MATCHER_TEXT_LENGTH = 320;
const MAX_ORDERED_FRAGMENTS = 128;
const MIN_FRAGMENT_LENGTH = 4;
const MAX_MARKDOWN_LINK_LABEL_LENGTH = 200;
const MAX_MARKDOWN_LINK_DESTINATION_LENGTH = 500;

function stripQuoteMarkdown(value: string) {
  return value
    .replace(/\\([\\`*_{}[\]()#+.!<>|-])/g, '$1')
    .replace(/<([^>\s]+)>/g, ' $1 ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, (match) => ` ${match} `)
    .replace(/\[\[([^\]|]+)\|([^\]]+)]]/g, '$2')
    .replace(/\[\[([^\]]+)]]/g, '$1')
    .replace(/(?<!!)\[]\([^)]+\)/g, ' ')
    .replace(/\(\[View Highlight]\([^)]+\)\)/gi, ' ')
    .replace(
      new RegExp(
        `(?<!!)\\[([^\\]]{1,${MAX_MARKDOWN_LINK_LABEL_LENGTH}})]\\([^\\)\\n]{1,${MAX_MARKDOWN_LINK_DESTINATION_LENGTH}}\\)`,
        'g'
      ),
      '$1'
    )
    .replace(/]\([^)]+\)/g, ' ')
    .replace(/(^|\s)•\s+/g, '$1')
    .replace(/[|`*_<>#]/g, ' ');
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').replace(/]\s+\[/g, '][').trim();
}

function stripLeadingListMarker(value: string) {
  return value
    .trimStart()
    .replace(/^[-*+•]\s+/, '')
    .replace(/^\d+[.)]\s+/, '');
}

function normalizeQuoteText(value: string) {
  return normalizeChineseVariants(compactWhitespace(normalizeQuoteLines(value).join(' ')));
}

function normalizeQuoteLines(value: string) {
  return stripQuoteMarkdown(normalizeLineEndings(value))
    .split('\n')
    .map((line) => normalizeChineseVariants(stripLeadingListMarker(compactWhitespace(line))));
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
  if (!source) {
    return null;
  }
  return new RegExp(source, 'u');
}

function isCjkQuote(value: string) {
  return /[\p{Script=Han}]/u.test(value);
}

function splitQuoteFragments(normalizedQuote: string) {
  if (!normalizedQuote) {
    return [];
  }

  const splitter = isCjkQuote(normalizedQuote)
    ? /[\s。！？!?；;：:，,、•✔❌]+/u
    : /[。！？!?；;：:，,、•✔❌]+/u;
  const unique = new Set<string>();

  for (const part of normalizedQuote.split(splitter)) {
    const fragment = part.trim();
    if (fragment.length < MIN_FRAGMENT_LENGTH) {
      continue;
    }
    unique.add(fragment);
  }

  return Array.from(unique.values())
    .sort((left, right) => right.length - left.length)
    .slice(0, MAX_ORDERED_FRAGMENTS);
}

export interface ContextExcerptQuoteLocator {
  exactMatcher: RegExp | null;
  normalizedQuote: string;
  orderedFragments: string[];
}

export function createContextExcerptQuoteLocator(quote: string): ContextExcerptQuoteLocator | null {
  const normalizedQuote = normalizeQuoteText(quote);
  if (!normalizedQuote) {
    return null;
  }
  return {
    exactMatcher: createLooseMatcher(normalizedQuote),
    normalizedQuote,
    orderedFragments: splitQuoteFragments(normalizedQuote)
  };
}

export { normalizeLineEndings, normalizeQuoteLines, normalizeQuoteText };
