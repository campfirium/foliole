import type { TextAnchorLocator } from './textAnchorLocator.js';

const CONTEXT_WINDOW = 120;

function countCommonSuffix(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length);
  let length = 0;
  while (length < maxLength && left[left.length - 1 - length] === right[right.length - 1 - length]) {
    length += 1;
  }
  return length;
}

function countCommonPrefix(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length);
  let length = 0;
  while (length < maxLength && left[length] === right[length]) {
    length += 1;
  }
  return length;
}

function collectOriginalTextCandidates(nextContent: string, originalText: string) {
  const candidates: number[] = [];
  let index = nextContent.indexOf(originalText);
  while (index >= 0) {
    candidates.push(index);
    index = nextContent.indexOf(originalText, index + 1);
  }
  return candidates;
}

function scoreCandidate(args: {
  candidateFrom: number;
  locator: TextAnchorLocator;
  nextContent: string;
  originalText: string;
  preferredIndex: number;
  previousContent: string;
}) {
  const previousBefore = args.previousContent.slice(Math.max(0, args.locator.from - CONTEXT_WINDOW), args.locator.from);
  const previousAfter = args.previousContent.slice(args.locator.to, args.locator.to + CONTEXT_WINDOW);
  const candidateTo = args.candidateFrom + args.originalText.length;
  const nextBefore = args.nextContent.slice(Math.max(0, args.candidateFrom - CONTEXT_WINDOW), args.candidateFrom);
  const nextAfter = args.nextContent.slice(candidateTo, candidateTo + CONTEXT_WINDOW);
  const contextScore = countCommonSuffix(previousBefore, nextBefore) + countCommonPrefix(previousAfter, nextAfter);
  const distancePenalty = Math.min(Math.abs(args.candidateFrom - args.preferredIndex), CONTEXT_WINDOW);
  return contextScore * (CONTEXT_WINDOW + 1) - distancePenalty;
}

export function resolveBestOriginalTextCandidate(args: {
  locator: TextAnchorLocator;
  nextContent: string;
  originalText: string;
  preferredIndex: number;
  previousContent: string;
}) {
  const candidates = collectOriginalTextCandidates(args.nextContent, args.originalText);
  if (candidates.length === 0) {
    return null;
  }
  let bestIndex = candidates[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  let tied = false;
  candidates.forEach((candidateFrom) => {
    const score = scoreCandidate({ ...args, candidateFrom });
    if (score > bestScore) {
      bestIndex = candidateFrom;
      bestScore = score;
      tied = false;
      return;
    }
    if (score === bestScore) {
      tied = true;
    }
  });
  if (tied && args.nextContent.slice(args.locator.from, args.locator.to) === args.originalText) {
    bestIndex = args.locator.from;
  }
  return { from: bestIndex, originalText: args.originalText, to: bestIndex + args.originalText.length };
}

export function repairTextAnchorLocatorInContent(content: string, locator: TextAnchorLocator): TextAnchorLocator | null {
  if (content.slice(locator.from, locator.to) === locator.originalText) {
    return locator;
  }
  const candidates = collectOriginalTextCandidates(content, locator.originalText);
  if (candidates.length !== 1) {
    return null;
  }
  const from = candidates[0]!;
  return { from, originalText: locator.originalText, to: from + locator.originalText.length };
}
