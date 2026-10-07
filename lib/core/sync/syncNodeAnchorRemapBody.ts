import { deriveMarkdownImageTextAnchorRegionsFromTexts } from '../anchors/markdownImageTextAnchor.js';
import { inspectTextAnchorInChunks } from '../anchors/textAnchorChunkSearch.js';
import { parseStoredAnchorLink } from '../database/anchorLinkCodec.js';

import type { DbPort } from './dbPort.js';
import { createLocatorValue, readTextLocators } from './syncNodeAnchorRemap.js';
import type { SyncNodeAnchorUnmappedReason } from './syncNodeAnchorRepair.js';
import { streamBodyText, type VerifiedBodyRef } from './verifiedBody.js';

export async function remapRawAnchorLinkInBody(input: {
  db: DbPort;
  body: VerifiedBodyRef;
  imageRegions: string | null;
  value: string;
}): Promise<{ imageRegions: string | null; value: string } | SyncNodeAnchorUnmappedReason | null> {
  const parsed = parseStoredAnchorLink(input.value);
  if (!parsed) return 'invalid_anchor_link';
  if (!parsed.locator) return 'no_locator';
  const locators = readTextLocators(parsed.locator);
  if (locators.length === 0) return 'non_text_locator';
  const results = [];
  for (const locator of locators) {
    results.push(await inspectTextAnchorInChunks({ chunks: streamBodyText(input.db, input.body),
      length: input.body.utf16Length, locator }));
  }
  if (results.every((result, index) => result.locator === locators[index])) return null;
  if (results.some((result) => result.locator === null)) {
    return results.some((result) => result.occurrences === 0) ? 'missing_text' : 'ambiguous_text';
  }
  const repaired = results.map((result) => result.locator!);
  const raw = JSON.parse(input.value) as { id: string; kind: string; locator: unknown };
  raw.locator = createLocatorValue(repaired);
  const regions = parsed.kind === 'image-excerpt' ? input.imageRegions
    : deriveMarkdownImageTextAnchorRegionsFromTexts(raw.id, repaired.map((locator) => locator.originalText));
  return { imageRegions: typeof regions === 'string' ? regions : regions ? JSON.stringify(regions) : null,
    value: JSON.stringify(raw) };
}
