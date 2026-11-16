import { parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

import type { TextAnchorLocator } from '../anchors/textAnchorLocator.js';

import { normalizeFullTextWithMap } from './contextExcerptFullTextNormalize.js';
import { convertSuperMemoContent } from './superMemoContent.js';
import { isSuperMemoReference, superMemoParentTextRange, type SuperMemoParentText } from './superMemoParentText.js';

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

function findAnswerPosition(parent: string, answer: string, context: NonNullable<ReturnType<typeof readBlankContext>>) {
  let onlyPosition: number | null = null;
  let onlyContextMatch: number | null = null;
  let count = 0;
  let contextCount = 0;
  const hasContext = context.before.length + context.after.length >= MIN_CONTEXT_LENGTH;
  for (const from of answerPositions(parent, answer)) {
    onlyPosition = from;
    count++;
    if (hasContext && parent.slice(0, from).trimEnd().endsWith(context.before) &&
      parent.slice(from + answer.length).trimStart().startsWith(context.after)) {
      onlyContextMatch = from;
      contextCount++;
    }
  }
  return count === 1 ? onlyPosition : contextCount === 1 ? onlyContextMatch : null;
}

export function findSuperMemoClozeLocator(parent: SuperMemoParentText,
  questionHtml: string[], answerMarkdown: string): TextAnchorLocator | null {
  const answer = normalizeFullTextWithMap(answerMarkdown).normalized.trim();
  if (!answer || !/[\p{L}\p{N}]/u.test(answer)) return null;
  const context = readBlankContext(questionHtml);
  if (!context) return null;
  const from = findAnswerPosition(parent.normalized, answer, context);
  if (from === null) return null;
  const locator = superMemoParentTextRange(parent, from, from + answer.length);
  if (!locator || locator.originalText.includes('\n') ||
    normalizeFullTextWithMap(locator.originalText).normalized.trim() !== answer) return null;
  return locator;
}
