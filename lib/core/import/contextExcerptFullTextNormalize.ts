import { normalizeLineEndings } from './contextExcerptQuoteLocator.js';

function appendCompactWhitespace(state: { normalized: string; rawIndexes: number[] }, rawIndex: number) {
  if (state.normalized.length === 0 || state.normalized.endsWith(' ')) {
    return;
  }
  state.normalized += ' ';
  state.rawIndexes.push(rawIndex);
}

function appendNormalizedCharacter(
  state: { normalized: string; rawIndexes: number[] },
  character: string,
  rawIndex: number
) {
  if (/\s/u.test(character)) {
    appendCompactWhitespace(state, rawIndex);
    return;
  }
  state.normalized += character;
  state.rawIndexes.push(rawIndex);
}

function findMarkdownLinkEnd(raw: string, labelEnd: number) {
  if (raw[labelEnd + 1] !== '(') {
    return -1;
  }
  return raw.indexOf(')', labelEnd + 2);
}

function shouldAppendLinkBoundarySpace(raw: string, linkEnd: number) {
  const next = raw[linkEnd + 1] ?? '';
  return next.length === 0 || !/[\s\p{P}\p{S}]/u.test(next);
}

function tryConsumeMarkdownLink(raw: string, index: number, state: { normalized: string; rawIndexes: number[] }) {
  const labelStart = raw[index] === '!' && raw[index + 1] === '[' ? index + 2 : raw[index] === '[' ? index + 1 : -1;
  if (labelStart < 0) {
    return 0;
  }
  const labelEnd = raw.indexOf(']', labelStart);
  if (labelEnd < 0) {
    return 0;
  }
  const linkEnd = findMarkdownLinkEnd(raw, labelEnd);
  if (linkEnd < 0) {
    return 0;
  }
  if (raw[index] !== '!') {
    for (let cursor = labelStart; cursor < labelEnd; cursor += 1) {
      appendNormalizedCharacter(state, raw[cursor] ?? '', cursor);
    }
  }
  if (shouldAppendLinkBoundarySpace(raw, linkEnd)) {
    appendCompactWhitespace(state, index);
  }
  return linkEnd - index + 1;
}

function tryConsumeWikiLink(raw: string, index: number, state: { normalized: string; rawIndexes: number[] }) {
  if (raw[index] !== '[' || raw[index + 1] !== '[') {
    return 0;
  }
  const end = raw.indexOf(']]', index + 2);
  if (end < 0) {
    return 0;
  }
  const body = raw.slice(index + 2, end);
  const pipeIndex = body.lastIndexOf('|');
  const displayStart = index + 2 + (pipeIndex >= 0 ? pipeIndex + 1 : 0);
  for (let cursor = displayStart; cursor < end; cursor += 1) {
    appendNormalizedCharacter(state, raw[cursor] ?? '', cursor);
  }
  return end - index + 2;
}

function consumeLineMarker(raw: string, index: number) {
  const match = /^[ \t]*(?:>\s*)*(?:[-*+•]\s+|\d+[.)]\s+)/u.exec(raw.slice(index));
  return match?.[0].length ?? 0;
}

export function normalizeFullTextWithMap(value: string) {
  const raw = normalizeLineEndings(value);
  const state = { normalized: '', rawIndexes: [] as number[] };
  let lineStart = true;
  for (let index = 0; index < raw.length; index += 1) {
    if (lineStart) {
      const consumed = consumeLineMarker(raw, index);
      if (consumed > 0) {
        index += consumed - 1;
        lineStart = false;
        continue;
      }
    }
    const wikiLength = tryConsumeWikiLink(raw, index, state);
    if (wikiLength > 0) {
      index += wikiLength - 1;
      lineStart = false;
      continue;
    }
    const linkLength = tryConsumeMarkdownLink(raw, index, state);
    if (linkLength > 0) {
      index += linkLength - 1;
      lineStart = false;
      continue;
    }
    const character = raw[index] ?? '';
    if (character === '\\' && /[\\`*_{}[\]()#+.!<>|-]/u.test(raw[index + 1] ?? '')) {
      lineStart = false;
      continue;
    }
    if (/[|`*_<>#]/u.test(character)) {
      appendCompactWhitespace(state, index);
      lineStart = false;
      continue;
    }
    appendNormalizedCharacter(state, character, index);
    lineStart = character === '\n';
  }
  while (state.normalized.endsWith(' ')) {
    state.normalized = state.normalized.slice(0, -1);
    state.rawIndexes.pop();
  }
  return { normalized: state.normalized, raw, rawIndexes: state.rawIndexes };
}
