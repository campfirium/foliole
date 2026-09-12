import { deriveMarkdownImageTextAnchorRegions } from '../anchors/markdownImageTextAnchor.js';

import type { StoredImageRegionGroup } from './imageRegionCodec.js';

export function deriveImportedHighlightImageRegions(input: {
  anchorId: string;
  content: string;
  locators: Array<{ from: number; to: number }>;
}) {
  return deriveMarkdownImageTextAnchorRegions(input) as StoredImageRegionGroup[] | null;
}
