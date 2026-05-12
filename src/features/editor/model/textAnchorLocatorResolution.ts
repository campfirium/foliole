import type { TextAnchorLocator } from '../../nodes/model/nodeTypes';
import type { EditorSelection } from '../adapters/EditorAdapter';

function clampTextAnchorSelection(_content: string, locator: TextAnchorLocator): EditorSelection {
  const from = Math.max(0, locator.from);
  const to = Math.max(from, locator.to);
  return { from, to };
}

function resolveTextAnchorSelectionInPlainText(
  content: string,
  locator: TextAnchorLocator
): EditorSelection {
  return clampTextAnchorSelection(content, locator);
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
  const isPureInsertion = args.previousChangeFrom === args.previousChangeTo && args.nextChangeFrom !== args.nextChangeTo;
  if (args.position < args.previousChangeFrom) {
    return args.position;
  }
  if (args.position > args.previousChangeTo) {
    return args.position + (args.nextChangeTo - args.previousChangeTo) - (args.nextChangeFrom - args.previousChangeFrom);
  }
  if (args.position === args.previousChangeFrom) {
    if (isPureInsertion) {
      return args.side === 'right' ? args.nextChangeFrom : args.nextChangeTo;
    }
    return args.side === 'right' ? args.nextChangeTo : args.nextChangeFrom;
  }
  if (args.position === args.previousChangeTo) {
    if (isPureInsertion) {
      return args.side === 'left' ? args.nextChangeTo : args.nextChangeFrom;
    }
    return args.side === 'left' ? args.nextChangeFrom : args.nextChangeTo;
  }
  return args.side === 'left' ? args.nextChangeFrom : args.nextChangeTo;
}

function resolveMaximumRemappedSpan(args: {
  locator: TextAnchorLocator;
  nextChangeFrom: number;
  nextChangeTo: number;
  previousChangeFrom: number;
  previousChangeTo: number;
}) {
  const previousSpan = Math.max(0, args.locator.to - args.locator.from);
  const previousChangeLength = args.previousChangeTo - args.previousChangeFrom;
  const nextChangeLength = args.nextChangeTo - args.nextChangeFrom;
  const changeIsInsideAnchor =
    args.previousChangeFrom >= args.locator.from &&
    args.previousChangeTo <= args.locator.to;
  return changeIsInsideAnchor
    ? Math.max(0, previousSpan + nextChangeLength - previousChangeLength)
    : previousSpan;
}

function resolveOriginalTextInChangedRange(args: {
  locator: TextAnchorLocator;
  nextChangeFrom: number;
  nextChangeTo: number;
  nextContent: string;
  previousChangeFrom: number;
  previousChangeTo: number;
}) {
  const originalText = args.locator.originalText;
  if (
    originalText.length === 0 ||
    args.locator.from < args.previousChangeFrom ||
    args.locator.to > args.previousChangeTo
  ) {
    return null;
  }
  const preferredIndex = args.nextChangeFrom + (args.locator.from - args.previousChangeFrom);
  let closestIndex = -1;
  let closestDistance = Number.POSITIVE_INFINITY;
  let index = args.nextContent.indexOf(originalText, args.nextChangeFrom);
  while (index >= 0 && index + originalText.length <= args.nextChangeTo) {
    const distance = Math.abs(index - preferredIndex);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
    index = args.nextContent.indexOf(originalText, index + 1);
  }
  if (closestIndex < 0) {
    return null;
  }
  return { from: closestIndex, originalText, to: closestIndex + originalText.length };
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
  const exactChangedRangeMatch = resolveOriginalTextInChangedRange({
    locator,
    nextChangeFrom,
    nextChangeTo,
    nextContent,
    previousChangeFrom,
    previousChangeTo
  });
  if (exactChangedRangeMatch) {
    return exactChangedRangeMatch;
  }
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
  const maximumSpan = resolveMaximumRemappedSpan({
    locator,
    nextChangeFrom,
    nextChangeTo,
    previousChangeFrom,
    previousChangeTo
  });
  const unclampedTo = Math.max(normalizedFrom, Math.min(Math.max(nextFrom, nextTo), nextContent.length));
  const normalizedTo = Math.min(unclampedTo, normalizedFrom + maximumSpan);
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
  const selection = clampTextAnchorSelection(content, locator);
  return {
    from: selection.from,
    originalText: locator.originalText,
    to: selection.to
  };
}
