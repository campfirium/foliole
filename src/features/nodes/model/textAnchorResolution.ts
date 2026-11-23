import {
  getTextAnchorLocators,
  type NodeAnchorLink,
  type TextAnchorLocator
} from './nodeTypes';

export function resolveTextAnchorLocatorInContent(
  parentContent: string,
  locator: TextAnchorLocator
): TextAnchorLocator | null {
  if (parentContent.slice(locator.from, locator.to) === locator.originalText) {
    return locator;
  }
  if (locator.originalText.length === 0) {
    return null;
  }
  const firstIndex = parentContent.indexOf(locator.originalText);
  if (firstIndex < 0 || parentContent.indexOf(locator.originalText, firstIndex + 1) >= 0) {
    return null;
  }
  return {
    from: firstIndex,
    originalText: locator.originalText,
    to: firstIndex + locator.originalText.length
  };
}

export function resolveTextAnchorLocatorsInContent(parentContent: string, locator: unknown) {
  const locators = getTextAnchorLocators(locator);
  const resolved = locators
    .map(range => resolveTextAnchorLocatorInContent(parentContent, range))
    .filter((range): range is TextAnchorLocator => range !== null);
  return resolved.length === locators.length ? resolved : null;
}

export function resolveTextAnchorLinkInContent(
  anchorLink: NodeAnchorLink,
  parentContent: string
): NodeAnchorLink | null {
  const resolvedLocators = resolveTextAnchorLocatorsInContent(parentContent, anchorLink.locator);
  if (!resolvedLocators) return null;
  if (resolvedLocators.length === 0) return anchorLink;
  return {
    ...anchorLink,
    locator: resolvedLocators.length === 1
      ? resolvedLocators[0]!
      : { ranges: resolvedLocators }
  };
}
