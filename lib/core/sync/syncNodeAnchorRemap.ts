import { deriveMarkdownImageTextAnchorRegions } from '../anchors/markdownImageTextAnchor.js';
import { repairTextAnchorLocatorInContent, type TextAnchorLocator } from '../anchors/textAnchorLocator.js';
import { parseStoredAnchorLink } from '../database/anchorLinkCodec.js';

import type { SyncNodeAnchorUnmappedReason } from './syncNodeAnchorRepair.js';

interface AnchorRepairResult {
  imageRegions: string | null;
  value: string;
}

function isTextLocator(locator: unknown): locator is TextAnchorLocator {
  return Boolean(
    locator &&
      typeof locator === 'object' &&
      !('ranges' in locator) &&
      typeof (locator as { from?: unknown }).from === 'number' &&
      typeof (locator as { to?: unknown }).to === 'number' &&
      typeof (locator as { originalText?: unknown }).originalText === 'string'
  );
}

export function readTextLocators(locator: unknown) {
  if (isTextLocator(locator)) {
    return [locator];
  }
  if (
    locator &&
    typeof locator === 'object' &&
    Array.isArray((locator as { ranges?: unknown }).ranges) &&
    (locator as { ranges: unknown[] }).ranges.every(isTextLocator)
  ) {
    return (locator as { ranges: TextAnchorLocator[] }).ranges;
  }
  return [];
}

export function createLocatorValue(locators: TextAnchorLocator[]) {
  const [locator] = locators;
  return locators.length === 1 && locator ? locator : { ranges: locators };
}

function textMatches(content: string, locator: TextAnchorLocator) {
  return content.slice(locator.from, locator.to) === locator.originalText;
}

function resolveRepairFailureReason(content: string, locators: TextAnchorLocator[]): SyncNodeAnchorUnmappedReason {
  return locators.some((locator) => locator.originalText.length === 0 || !content.includes(locator.originalText))
    ? 'missing_text'
    : 'ambiguous_text';
}

function toImageRegions(
  anchorId: string,
  content: string,
  locators: TextAnchorLocator[]
) {
  const regions = deriveMarkdownImageTextAnchorRegions({ anchorId, content, locators });
  return regions ? JSON.stringify(regions) : null;
}

export function remapRawAnchorLinkInContent(input: {
  content: string;
  imageRegions: string | null;
  value: string;
}): AnchorRepairResult | SyncNodeAnchorUnmappedReason | null {
  const parsed = parseStoredAnchorLink(input.value);
  if (!parsed) {
    return 'invalid_anchor_link';
  }
  if (!parsed.locator) {
    return 'no_locator';
  }
  const locators = readTextLocators(parsed.locator);
  if (locators.length === 0) {
    return 'non_text_locator';
  }
  if (locators.every((locator) => textMatches(input.content, locator))) {
    return null;
  }
  const repairedLocators = locators
    .map((locator) => repairTextAnchorLocatorInContent(input.content, locator))
    .filter((locator): locator is TextAnchorLocator => locator !== null);
  if (repairedLocators.length !== locators.length) {
    return resolveRepairFailureReason(input.content, locators);
  }
  const raw = JSON.parse(input.value) as { id: string; kind?: unknown; locator?: unknown };
  raw.locator = createLocatorValue(repairedLocators);
  return {
    imageRegions: raw.kind === 'image-excerpt'
      ? input.imageRegions
      : toImageRegions(raw.id, input.content, repairedLocators),
    value: JSON.stringify(raw)
  };
}
