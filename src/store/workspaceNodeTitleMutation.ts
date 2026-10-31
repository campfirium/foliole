import { isNodeTitleTruncated, normalizeNodeTitle } from '../../lib/core/nodes/nodeTitleBudget';
import { replaceUniqueArticleTitleHeading } from '../features/nodes/model/articleTitleHeading';
import { UNTITLED_NODE_TITLE } from '../features/nodes/model/deriveNodeTitle';
import type { Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { loadWorkspaceNodeDocumentFromRuntime } from '../shared/platform/workspaceRuntimeDocumentRepository';
import { canSaveNodeText, showNodeTitleShortenedNotice } from '../shared/ui/nodeTextSaveBudget';

import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument, type WorkspaceNodeDocument } from './workspaceRendererBoundary';
import { hasWorkspaceNodeMutationRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

export function loadWorkspaceTitleDocument(
  read: (reader: (state: WorkspaceState) => WorkspaceState) => void,
  nodeId: string
) {
  const current: { node: Node | undefined } = { node: undefined };
  read(state => { current.node = state.nodesById[nodeId]; return state; });
  if (!current.node || isProtectedRootNode(current.node)) return null;
  if (isNodeDocumentLoaded(current.node) || !hasWorkspaceNodeMutationRuntime()) return undefined;
  const node = current.node;
  return loadWorkspaceNodeDocumentFromRuntime(nodeId).then(document =>
    document && isNodeDocumentLoaded(mergeWorkspaceNodeDocument(node, document)) ? document : null
  ).catch(() => null);
}

export function buildRenamedWorkspaceNode(node: Node, title: string, document?: WorkspaceNodeDocument) {
  if (isProtectedRootNode(node)) return null;
  const nextTitle = normalizeNodeTitle(title.trim()) || UNTITLED_NODE_TITLE;
  if (node.title === nextTitle) {
    if (isNodeTitleTruncated(title.trim())) showNodeTitleShortenedNotice();
    return null;
  }
  const loaded = document && !isNodeDocumentLoaded(node) ? mergeWorkspaceNodeDocument(node, document) : node;
  const content = loaded.kind === 'topic'
    ? replaceUniqueArticleTitleHeading(loaded.content, nextTitle) ?? loaded.content
    : loaded.content;
  const next = { ...loaded, content, hasContent: content.trim().length > 0, hideTitleHeading: false,
    title: nextTitle, isTitleManual: true, updatedAt: new Date().toISOString() };
  return canSaveNodeText(next) ? next : null;
}
