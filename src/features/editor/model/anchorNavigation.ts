import { isTextAnchorLocator } from '../../nodes/model/nodeTypes';
import type { NodeAnchorLink } from '../../nodes/model/nodeTypes';
import type { EditorSelection } from '../adapters/EditorAdapter';

import { hasInlineAnchorMarkup } from './anchorBlocks';
import { findAnchorRecord, getAnchorContentRange } from './anchorRecords';
import { resolveTextAnchorLocatorSelection } from './textAnchorLocatorResolution';

export type AnchorNavigationTarget = Pick<NodeAnchorLink, 'id' | 'kind' | 'locator'>;

function resolveTextAnchorSelection(
  content: string,
  locator: NonNullable<NodeAnchorLink['locator']>
): EditorSelection | null {
  if (!isTextAnchorLocator(locator)) {
    return null;
  }
  return resolveTextAnchorLocatorSelection(content, locator);
}

export function findAnchorSelection(content: string, anchor: AnchorNavigationTarget): EditorSelection | null {
  const locatorSelection = anchor.locator ? resolveTextAnchorSelection(content, anchor.locator) : null;
  if (locatorSelection) {
    return locatorSelection;
  }
  if (!hasInlineAnchorMarkup(content)) {
    return null;
  }
  const record = findAnchorRecord(content, anchor);
  if (!record) {
    return null;
  }
  return getAnchorContentRange(record);
}
