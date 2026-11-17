import { parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

import type { TextAnchorLocator } from '../anchors/textAnchorLocator.js';

import { normalizeFullTextWithMap } from './contextExcerptFullTextNormalize.js';
import { convertSuperMemoContent } from './superMemoContent.js';
import { isSuperMemoNativeMarked, isSuperMemoReference, superMemoParentTextRange, type SuperMemoParentText } from './superMemoParentText.js';

const BLANK_MARKER = 'FOLIOLESUPERMEMOCLOZEPLACEHOLDER';
const CONTEXT_LENGTH = 12;
const MIN_CONTEXT_LENGTH = 8;

function replaceClozeBlanks(parent: DefaultTreeAdapterTypes.ParentNode): number {
  let count = 0;
  parent.childNodes = parent.childNodes.filter(node => !('tagName' in node) || !isSuperMemoReference(node));
  for (const node of parent.childNodes) {
    if (!('tagName' in node)) continue;
    const className = node.attrs.find(attribute => attribute.name === 'class')?.value;
    if (className?.toLowerCase().split(/\s+/u).includes('cloze') && /^\[\s*(?:\.{3}|…)\s*\]$/u.test(serialize(node).trim())) {
      node.childNodes = [{ nodeName: '#text', value: BLANK_MARKER, parentNode: node }];
      count++;
    } else {
      count += replaceClozeBlanks(node);
    }
  }
  return count;
}

function readBlankContext(parts: string[]) {
  const fragments = parts.map(part => parseFragment(part));
  const count = fragments.reduce((total, fragment) => total + replaceClozeBlanks(fragment), 0);
  if (count !== 1) return null;
  const question = convertSuperMemoContent(fragments.map(fragment => serialize(fragment))).content;
  const sides = normalizeFullTextWithMap(question).normalized.split(BLANK_MARKER);
  if (sides.length !== 2) return null;
  return {
    before: sides[0]!.trimEnd().slice(-CONTEXT_LENGTH),
    after: sides[1]!.trimStart().slice(0, CONTEXT_LENGTH)
  };
}

function isInsideLatinWord(text: string, index: number) {
  return /[\p{Script=Latin}\p{N}]/u.test(text[index - 1] ?? '') &&
    /[\p{Script=Latin}\p{N}]/u.test(text[index] ?? '');
}

function* answerPositions(parent: string, answer: string) {
  for (let from = parent.indexOf(answer); from !== -1; from = parent.indexOf(answer, from + 1)) {
    if (!isInsideLatinWord(parent, from) && !isInsideLatinWord(parent, from + answer.length)) yield from;
  }
}

function findAnswerPosition(parent: SuperMemoParentText, answer: string, context: NonNullable<ReturnType<typeof readBlankContext>>) {
  const text = parent.normalized;
  const positions = [...answerPositions(text, answer)];
  if (positions.length <= 1) return positions[0] ?? null;
  const contextMatches = context.before.length + context.after.length < MIN_CONTEXT_LENGTH ? [] : positions.filter(from =>
    text.slice(0, from).trimEnd().endsWith(context.before) &&
    text.slice(from + answer.length).trimStart().startsWith(context.after));
  if (contextMatches.length === 1) return contextMatches[0]!;
  const candidates = contextMatches.length ? contextMatches : positions;
  const marked = candidates.filter(from => isSuperMemoNativeMarked(parent, 'cloze', from, from + answer.length));
  return marked.length === 1 ? marked[0]! : null;
}

export function findSuperMemoClozeLocator(parent: SuperMemoParentText,
  questionHtml: string[], answerMarkdown: string): TextAnchorLocator | null {
  const answer = normalizeFullTextWithMap(answerMarkdown).normalized.trim();
  if (!answer || !/[\p{L}\p{N}]/u.test(answer)) return null;
  const context = readBlankContext(questionHtml);
  if (!context) return null;
  const from = findAnswerPosition(parent, answer, context);
  if (from === null) return null;
  const locator = superMemoParentTextRange(parent, from, from + answer.length);
  if (!locator || locator.originalText.includes('\n') ||
    normalizeFullTextWithMap(locator.originalText).normalized.trim() !== answer) return null;
  return locator;
}
