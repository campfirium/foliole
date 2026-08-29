import { deriveMarkdownImageTextAnchorRegions, expandMarkdownImageTextLocator } from '../anchors/markdownImageTextAnchor.js';
import { remapTextAnchorLocator, type TextAnchorLocator } from '../anchors/textAnchorLocator.js';

import { parseStoredAnchorLink, type StoredAnchorLink } from './anchorLinkCodec.js';
import type { StoredImageRegionGroup } from './imageRegionCodec.js';

export type StoredAnchorLinkRemapSkipReason = 'invalid_anchor_link' | 'non_text_locator' | 'no_locator';

export type RawStoredAnchorLinkRemapResult =
  | { reason: StoredAnchorLinkRemapSkipReason }
  | { imageRegions: string | null; value: string };

export interface StoredAnchorLinkRemapResult {
  anchorLink: StoredAnchorLink;
  imageRegions: StoredImageRegionGroup[] | null;
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

function readTextLocators(locator: unknown) {
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

function createLocatorValue(locators: TextAnchorLocator[]) {
  const [locator] = locators;
  return locators.length === 1 && locator ? locator : { ranges: locators };
}

function remapLocators(input: {
  nextContent: string;
  previousContent: string;
  locators: TextAnchorLocator[];
}) {
  return input.locators.map((locator) =>
    expandMarkdownImageTextLocator(
      input.nextContent,
      remapTextAnchorLocator(input.nextContent, locator, input.previousContent),
      locator
    )
  );
}

function toImageRegions(anchorId: unknown, content: string, locators: TextAnchorLocator[]) {
  if (typeof anchorId !== 'string' || anchorId.trim().length === 0) {
    return null;
  }
  return deriveMarkdownImageTextAnchorRegions({ anchorId, content, locators }) as StoredImageRegionGroup[] | null;
}

export function remapStoredTextAnchorLink(input: {
  anchorLink: StoredAnchorLink;
  imageRegions?: StoredImageRegionGroup[] | null;
  nextContent: string;
  previousContent: string;
}): StoredAnchorLinkRemapResult | null {
  const locators = readTextLocators(input.anchorLink.locator);
  if (locators.length === 0) {
    return null;
  }
  const nextLocators = remapLocators({
    locators,
    nextContent: input.nextContent,
    previousContent: input.previousContent
  });
  return {
    anchorLink: {
      ...input.anchorLink,
      locator: createLocatorValue(nextLocators)
    },
    imageRegions: input.anchorLink.kind === 'image-excerpt'
      ? input.imageRegions ?? null
      : toImageRegions(input.anchorLink.id, input.nextContent, nextLocators)
  };
}

export function remapRawStoredAnchorLink(input: {
  imageRegions?: string | null;
  nextContent: string;
  previousContent: string;
  value: string;
}): RawStoredAnchorLinkRemapResult {
  const parsed = parseStoredAnchorLink(input.value);
  if (!parsed) {
    return { reason: 'invalid_anchor_link' };
  }
  const raw = JSON.parse(input.value) as { id?: unknown; kind?: unknown; locator?: unknown };
  if (!raw.locator) {
    return { reason: 'no_locator' };
  }
  const locators = readTextLocators(raw.locator);
  if (locators.length === 0) {
    return { reason: 'non_text_locator' };
  }
  const nextLocators = remapLocators({
    locators,
    nextContent: input.nextContent,
    previousContent: input.previousContent
  });
  raw.locator = createLocatorValue(nextLocators);
  const imageRegions = raw.kind === 'image-excerpt'
    ? input.imageRegions ?? null
    : toImageRegions(raw.id, input.nextContent, nextLocators);
  return {
    imageRegions: typeof imageRegions === 'string'
      ? imageRegions
      : imageRegions
        ? JSON.stringify(imageRegions)
        : null,
    value: JSON.stringify(raw)
  };
}
