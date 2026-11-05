import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { isTextAnchorLocator } from '../features/nodes/model/nodeTypes';
import { resolveTextAnchorLocatorInContent } from '../features/nodes/model/textAnchorResolution';
import { HighlightRangeHandles } from '../shared/ui/HighlightRangeHandles';

export function resolveCompanionAdjustableHighlight(args: {
  editor: EditorAdapter | null;
  nodeId: string | undefined;
  parentNodeId: string | undefined;
  snapshot: WorkspaceSnapshot | null;
}) {
  const node = args.nodeId ? args.snapshot?.nodesById[args.nodeId] : null;
  const anchor = node?.anchorLink;
  if (!node || !args.editor || node.parentNodeId !== args.parentNodeId || node.deletedAt ||
    args.snapshot?.trashedNodeIds.includes(node.id) ||
    (anchor?.kind !== 'highlight' && anchor?.kind !== 'cloze') || !isTextAnchorLocator(anchor.locator)) return null;
  const locator = resolveTextAnchorLocatorInContent(args.editor.getContent(), anchor.locator);
  return locator ? { kind: anchor.kind, locator, nodeId: node.id } : null;
}

export function CompanionHighlightRangeHandles(props: {
  editor: EditorAdapter | null;
  parentNodeId: string | undefined;
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
  disabled: boolean;
  onCommit: (nodeId: string, range: { from: number; to: number }) => Promise<boolean>;
}) {
  const highlight = resolveCompanionAdjustableHighlight(props);
  return <HighlightRangeHandles touch editor={props.editor} highlight={highlight}
    disabled={props.disabled} onCommit={props.onCommit} />;
}
