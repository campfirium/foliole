import { remapTextAnchorLocator } from '../../../../lib/core/anchors/textAnchorLocator';
import type { TextAnchorLocator } from '../../nodes/model/nodeTypes';
import type { EditorSelection } from '../adapters/EditorAdapter';

export { remapTextAnchorLocator };

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
