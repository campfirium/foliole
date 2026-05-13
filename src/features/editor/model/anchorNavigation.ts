import { getTextAnchorLocators, isTextAnchorLocator, type NodeAnchorLink } from '../../nodes/model/nodeTypes';
import type { EditorSelection } from '../adapters/EditorAdapter';

import { resolveTextAnchorLocatorSelection } from './textAnchorLocatorResolution';

export type AnchorNavigationTarget = Pick<NodeAnchorLink, 'id' | 'kind' | 'locator'>;

function resolveUnresolvedTextAnchorFallback(
  content: string,
  locator: NonNullable<NodeAnchorLink['locator']>
): EditorSelection | null {
  if (!isTextAnchorLocator(locator) || locator.from !== locator.to) {
    return null;
  }
  const position = Math.max(0, Math.min(locator.from, content.length));
  return { from: position, to: position };
}

function resolveTextAnchorSelection(
  content: string,
  locator: NonNullable<NodeAnchorLink['locator']>
): EditorSelection | null {
  const locators = getTextAnchorLocators(locator);
  if (locators.length === 0) {
    return null;
  }
  const firstLocator = locators[0];
  if (!firstLocator) {
    return null;
  }
  const selection = resolveTextAnchorLocatorSelection(content, firstLocator);
  if (!selection) {
    return null;
  }
  const { from, to } = selection;
  if (from === to) {
    return resolveUnresolvedTextAnchorFallback(content, firstLocator);
  }
  return { from, to };
}

export function findAnchorSelection(content: string, anchor: AnchorNavigationTarget): EditorSelection | null {
  return anchor.locator ? resolveTextAnchorSelection(content, anchor.locator) : null;
}
