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

export function resolveTextAnchorLinkInContent(
  anchorLink: NodeAnchorLink,
  parentContent: string
): NodeAnchorLink | null {
  const locators = getTextAnchorLocators(anchorLink.locator);
  if (locators.length === 0) {
    return anchorLink;
  }
  const resolvedLocators = locators
    .map((locator) => resolveTextAnchorLocatorInContent(parentContent, locator))
    .filter((locator): locator is TextAnchorLocator => locator !== null);
  if (resolvedLocators.length !== locators.length) {
    return null;
  }
  return {
    ...anchorLink,
    locator: resolvedLocators.length === 1
      ? resolvedLocators[0]!
      : { ranges: resolvedLocators }
  };
}
