import { getTextAnchorLocators, isPdfAnchorLocator, type NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { NodeViewState } from '../../store/workspaceStore';

function resolveAnchorSelection(anchor: NodeAnchorLink) {
  if (isPdfAnchorLocator(anchor.locator)) {
    return null;
  }
  const firstLocator = getTextAnchorLocators(anchor.locator)[0];
  if (!firstLocator) {
    return null;
  }
  return {
    from: Math.max(0, firstLocator.from),
    to: Math.max(0, firstLocator.to)
  };
}

export function buildAnchorViewState(
  anchor: NodeAnchorLink | null | undefined,
  existingViewState: NodeViewState | undefined,
  scrollTopOverride?: number,
  collapseToCaret = false
) {
  if (!anchor) {
    return null;
  }
  const selection = resolveAnchorSelection(anchor);
  if (!selection) {
    return null;
  }
  return {
    scrollTop: typeof scrollTopOverride === 'number' ? scrollTopOverride : existingViewState?.scrollTop ?? 0,
    selection: collapseToCaret ? { from: selection.from, to: selection.from } : selection
  };
}
