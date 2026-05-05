import type { TextAnchorLocator } from '../../nodes/model/nodeTypes';
import type { EditorSelection } from '../adapters/EditorAdapter';

function findUniqueTextRange(content: string, originalText: string) {
  if (!originalText) {
    return null;
  }
  const firstFrom = content.indexOf(originalText);
  if (firstFrom < 0) {
    return null;
  }
  const secondFrom = content.indexOf(originalText, firstFrom + 1);
  if (secondFrom >= 0) {
    return null;
  }
  return {
    from: firstFrom,
    to: firstFrom + originalText.length
  };
}

function getSharedPrefixLengthForText(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;
  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function getSharedSuffixLengthForText(left: string, right: string, sharedPrefixLength = 0) {
  const leftRemaining = left.length - sharedPrefixLength;
  const rightRemaining = right.length - sharedPrefixLength;
  const maxLength = Math.min(leftRemaining, rightRemaining);
  let length = 0;
  while (length < maxLength && left[left.length - 1 - length] === right[right.length - 1 - length]) {
    length += 1;
  }
  return length;
}

function getTextSimilarityScore(left: string, right: string) {
  const sharedPrefixLength = getSharedPrefixLengthForText(left, right);
  const sharedSuffixLength = getSharedSuffixLengthForText(left, right, sharedPrefixLength);
  return sharedPrefixLength + sharedSuffixLength;
}

function isWordLikeCharacter(character: string | undefined) {
  return typeof character === 'string' && /[\p{L}\p{N}_-]/u.test(character);
}

function expandRangeToWordBoundaries(content: string, from: number, to: number) {
  let nextFrom = from;
  let nextTo = to;
  while (nextFrom > 0 && isWordLikeCharacter(content[nextFrom - 1])) {
    nextFrom -= 1;
  }
  while (nextTo < content.length && isWordLikeCharacter(content[nextTo])) {
    nextTo += 1;
  }
  return { from: nextFrom, to: nextTo };
}

function findEditedTextRangeNearStoredOffset(content: string, locator: TextAnchorLocator) {
  const clampedFrom = Math.max(0, Math.min(locator.from, content.length));
  const clampedTo = Math.max(clampedFrom, Math.min(locator.to, content.length));
  const hintedRange = expandRangeToWordBoundaries(content, clampedFrom, clampedTo);
  if (hintedRange.from === hintedRange.to) {
    return null;
  }
  const candidateText = content.slice(hintedRange.from, hintedRange.to);
  const similarityScore = getTextSimilarityScore(locator.originalText, candidateText);
  const minimumSimilarityScore = Math.max(2, Math.ceil(Math.min(locator.originalText.length, candidateText.length) / 2));
  if (similarityScore < minimumSimilarityScore) {
    return null;
  }
  return hintedRange;
}

function resolveTextAnchorSelectionInPlainText(
  content: string,
  locator: TextAnchorLocator
): EditorSelection | null {
  if (locator.to <= content.length && content.slice(locator.from, locator.to) === locator.originalText) {
    return {
      from: locator.from,
      to: locator.to
    };
  }
  return findUniqueTextRange(content, locator.originalText);
}

export function resolveTextAnchorLocatorSelection(
  content: string,
  locator: TextAnchorLocator
): EditorSelection | null {
  return resolveTextAnchorSelectionInPlainText(content, locator);
}

function getSharedPrefixLength(previousContent: string, nextContent: string) {
  const maxLength = Math.min(previousContent.length, nextContent.length);
  let index = 0;
  while (index < maxLength && previousContent[index] === nextContent[index]) {
    index += 1;
  }
  return index;
}

function getSharedSuffixLength(previousContent: string, nextContent: string, sharedPrefixLength: number) {
  const previousRemaining = previousContent.length - sharedPrefixLength;
  const nextRemaining = nextContent.length - sharedPrefixLength;
  const maxLength = Math.min(previousRemaining, nextRemaining);
  let length = 0;
  while (
    length < maxLength &&
    previousContent[previousContent.length - 1 - length] === nextContent[nextContent.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function mapPositionThroughContentChange(args: {
  nextChangeFrom: number;
  nextChangeTo: number;
  position: number;
  previousChangeFrom: number;
  previousChangeTo: number;
  side: 'left' | 'right';
}) {
  if (args.position < args.previousChangeFrom) {
    return args.position;
  }
  if (args.position > args.previousChangeTo) {
    return args.position + (args.nextChangeTo - args.previousChangeTo) - (args.nextChangeFrom - args.previousChangeFrom);
  }
  if (args.position === args.previousChangeFrom) {
    return args.side === 'right' ? args.nextChangeTo : args.nextChangeFrom;
  }
  if (args.position === args.previousChangeTo) {
    return args.side === 'left' ? args.nextChangeFrom : args.nextChangeTo;
  }
  return args.side === 'left' ? args.nextChangeFrom : args.nextChangeTo;
}

function remapTextAnchorLocatorThroughContentChange(
  previousContent: string,
  nextContent: string,
  locator: TextAnchorLocator
) {
  const sharedPrefixLength = getSharedPrefixLength(previousContent, nextContent);
  const sharedSuffixLength = getSharedSuffixLength(previousContent, nextContent, sharedPrefixLength);
  const previousChangeFrom = sharedPrefixLength;
  const previousChangeTo = previousContent.length - sharedSuffixLength;
  const nextChangeFrom = sharedPrefixLength;
  const nextChangeTo = nextContent.length - sharedSuffixLength;
  const nextFrom = mapPositionThroughContentChange({
    nextChangeFrom,
    nextChangeTo,
    position: locator.from,
    previousChangeFrom,
    previousChangeTo,
    side: 'left'
  });
  const nextTo = mapPositionThroughContentChange({
    nextChangeFrom,
    nextChangeTo,
    position: locator.to,
    previousChangeFrom,
    previousChangeTo,
    side: 'right'
  });
  const normalizedFrom = Math.max(0, Math.min(nextFrom, nextTo, nextContent.length));
  const normalizedTo = Math.max(normalizedFrom, Math.min(Math.max(nextFrom, nextTo), nextContent.length));
  return {
    from: normalizedFrom,
    originalText:
      normalizedFrom === normalizedTo
        ? locator.originalText
        : nextContent.slice(normalizedFrom, normalizedTo),
    to: normalizedTo
  };
}

export function remapTextAnchorLocator(
  content: string,
  locator: TextAnchorLocator,
  previousContent?: string
): TextAnchorLocator {
  if (typeof previousContent === 'string') {
    return remapTextAnchorLocatorThroughContentChange(previousContent, content, locator);
  }
  const selection = resolveTextAnchorSelectionInPlainText(content, locator);
  if (!selection) {
    const hintedRange = findEditedTextRangeNearStoredOffset(content, locator);
    if (hintedRange) {
      return {
        from: hintedRange.from,
        originalText: content.slice(hintedRange.from, hintedRange.to),
        to: hintedRange.to
      };
    }
    const unresolvedAt = Math.max(0, Math.min(locator.from, content.length));
    return {
      from: unresolvedAt,
      originalText: locator.originalText,
      to: unresolvedAt
    };
  }
  return {
    from: selection.from,
    originalText: content.slice(selection.from, selection.to),
    to: selection.to
  };
}
