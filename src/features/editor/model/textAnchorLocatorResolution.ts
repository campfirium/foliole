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

export function resolveTextAnchorLocatorSelection(
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

export function remapTextAnchorLocator(content: string, locator: TextAnchorLocator): TextAnchorLocator {
  const selection = resolveTextAnchorLocatorSelection(content, locator);
  if (!selection) {
    return locator;
  }
  return {
    from: selection.from,
    originalText: locator.originalText,
    to: selection.to
  };
}
