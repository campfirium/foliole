import type { NativeAssistantWorkspaceContext } from '../../../lib/platform/nativeAssistantContract';
import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { sortFolderListNodes } from '../../features/nodes/model/folderListOrdering';
import { getTextAnchorLocators, isPdfAnchorLocator, type Node } from '../../features/nodes/model/nodeTypes';
import { getNodeDocumentStatus, isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

const DOCUMENT_PREVIEW_LIMIT = 4000;
const CHILDREN_LIMIT = 30;
const CHILD_PREVIEW_LIMIT = 220;
const SELECTION_TEXT_LIMIT = 1200;
const SELECTION_RANGE_LIMIT = 5;

export function resolveAssistantWorkspaceContext(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  editorAdapter: EditorAdapter | null = null
): NativeAssistantWorkspaceContext {
  const activeNode = activeNodeId ? nodesById[activeNodeId] : null;
  if (!activeNode) {
    return {
      folder: resolveWorkspaceRootContext(nodesById),
      scope: 'workspace',
      schemaVersion: 1
    };
  }
  const context: NativeAssistantWorkspaceContext = {
    activeKind: activeNode.kind,
    activeNodeId: activeNode.id,
    ...(activeNode.parentNodeId ? { activeParentNodeId: activeNode.parentNodeId } : {}),
    ...(activeNode.specialKind ? { activeSpecialKind: activeNode.specialKind } : {}),
    activeTitle: activeNode.title,
    ...(activeNode.anchorLink ? { anchor: resolveAnchorContext(activeNode, nodesById) } : {}),
    path: resolveNodePath(activeNode, nodesById),
    schemaVersion: 1,
    scope: 'node'
  };
  const document = activeNode.specialKind ? null : resolveDocumentContext(activeNode);
  const folder = resolveFolderContext(activeNode, nodesById);
  const parentFolder = resolveParentFolderContext(activeNode, nodesById);
  const selection = resolveSelectionContext(editorAdapter);
  if (document) context.document = document;
  if (folder) context.folder = folder;
  if (parentFolder) context.parentFolder = parentFolder;
  if (selection) context.selection = selection;
  return context;
}

export function resolveAssistantVisibleListWorkspaceContext(args: {
  activeNodeId: string;
  itemNodeIds: string[];
  nodesById: Record<string, Node>;
  title: string;
}): NativeAssistantWorkspaceContext {
  const children = args.itemNodeIds
    .map((nodeId) => args.nodesById[nodeId])
    .filter((node): node is Node => Boolean(node));
  return {
    activeKind: 'folder',
    activeNodeId: args.activeNodeId,
    activeTitle: args.title,
    folder: toFolderContext(children, args.itemNodeIds),
    path: [args.title],
    schemaVersion: 1,
    scope: 'node'
  };
}

function resolveAnchorContext(
  node: Node,
  nodesById: Record<string, Node>
): NonNullable<NativeAssistantWorkspaceContext['anchor']> {
  const parent = node.parentNodeId ? nodesById[node.parentNodeId] : null;
  const text = getTextAnchorLocators(node.anchorLink?.locator).map((locator) => locator.originalText).join('\n');
  const locator = node.anchorLink?.locator;
  return {
    id: node.anchorLink?.id ?? node.id,
    kind: node.anchorLink?.kind ?? 'highlight',
    ...(isPdfAnchorLocator(locator) ? { page: locator.page } : {}),
    ...(parent ? { parentNodeId: parent.id, parentTitle: parent.title } : {}),
    ...(text ? { text: truncateText(text, CHILD_PREVIEW_LIMIT).text } : {})
  };
}

function resolveDocumentContext(node: Node): NativeAssistantWorkspaceContext['document'] {
  const bodyStatus = getNodeDocumentStatus(node);
  if (!isNodeDocumentLoaded(node)) return { bodyStatus };
  const preview = truncateText(node.content, DOCUMENT_PREVIEW_LIMIT);
  return {
    bodyStatus,
    charCount: node.content.length,
    ...(preview.text ? { preview: preview.text } : {}),
    truncated: preview.truncated
  };
}

function resolveWorkspaceRootContext(
  nodesById: Record<string, Node>
): NonNullable<NativeAssistantWorkspaceContext['folder']> {
  const roots = Object.values(nodesById).filter((candidate) => !candidate.parentNodeId);
  return toFolderContext(roots, undefined);
}

function resolveFolderContext(
  node: Node,
  nodesById: Record<string, Node>
): NativeAssistantWorkspaceContext['folder'] {
  const children = Object.values(nodesById).filter((candidate) => candidate.parentNodeId === node.id);
  return toFolderContext(children, node.manualChildOrder);
}

function resolveParentFolderContext(
  node: Node,
  nodesById: Record<string, Node>
): NativeAssistantWorkspaceContext['parentFolder'] {
  if (!node.parentNodeId) return undefined;
  const parent = nodesById[node.parentNodeId];
  if (!parent) return undefined;
  const siblings = Object.values(nodesById).filter((candidate) => candidate.parentNodeId === parent.id);
  return toFolderContext(siblings, parent.manualChildOrder, node.id);
}

function toFolderContext(
  children: Node[],
  manualChildOrder: string[] | null | undefined,
  activeNodeId?: string
): NonNullable<NativeAssistantWorkspaceContext['folder']> {
  const orderedChildren = sortFolderListNodes(children, 'manual', 'asc', {}, manualChildOrder ?? undefined);
  return {
    childCount: children.length,
    children: orderedChildren.slice(0, CHILDREN_LIMIT).map((child) => toChildSummary(child, activeNodeId)),
    truncated: orderedChildren.length > CHILDREN_LIMIT
  };
}

function toChildSummary(node: Node, activeNodeId?: string) {
  const preview = truncateText(node.openingText || node.content, CHILD_PREVIEW_LIMIT);
  return {
    ...(node.anchorLink ? { anchorKind: node.anchorLink.kind } : {}),
    ...(node.bodyStatus ? { bodyStatus: node.bodyStatus } : {}),
    hasContent: node.hasContent ?? node.content.trim().length > 0,
    ...(node.id === activeNodeId ? { isActive: true } : {}),
    kind: node.kind,
    nodeId: node.id,
    ...(preview.text ? { preview: preview.text } : {}),
    ...(node.specialKind ? { specialKind: node.specialKind } : {}),
    title: node.title,
    updatedAt: node.updatedAt
  };
}

function resolveNodePath(activeNode: Node, nodesById: Record<string, Node>) {
  const path: string[] = [];
  let node: Node | null | undefined = activeNode;
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    if (node.title.trim()) path.unshift(node.title.trim());
    node = node.parentNodeId ? nodesById[node.parentNodeId] : null;
  }
  return path;
}

function truncateText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return {
    text: normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 3).trimEnd()}...`,
    truncated: normalized.length > limit
  };
}

function resolveSelectionContext(
  editorAdapter: EditorAdapter | null
): NativeAssistantWorkspaceContext['selection'] {
  if (!editorAdapter) return undefined;
  const content = editorAdapter.getContent();
  const ranges = normalizeSelectionRanges(editorAdapter.getSelectionRanges(), content.length);
  if (ranges.length === 0) return undefined;
  const selectedText = ranges.map((range) => content.slice(range.from, range.to)).join('\n');
  const preview = truncateText(selectedText, SELECTION_TEXT_LIMIT);
  return {
    charCount: selectedText.length,
    ranges: ranges.slice(0, SELECTION_RANGE_LIMIT),
    text: preview.text,
    truncated: preview.truncated || ranges.length > SELECTION_RANGE_LIMIT
  };
}

function normalizeSelectionRanges(selections: EditorSelection[], max: number) {
  const normalizedSelections = selections
    .map((selection) => ({
      from: Math.max(0, Math.min(selection.from, selection.to, max)),
      to: Math.max(0, Math.min(Math.max(selection.from, selection.to), max))
    }))
    .filter((selection) => selection.from < selection.to)
    .sort((left, right) => left.from - right.from);
  return normalizedSelections.reduce<EditorSelection[]>((merged, selection) => {
    const previous = merged[merged.length - 1];
    if (!previous || selection.from > previous.to) {
      merged.push(selection);
      return merged;
    }
    previous.to = Math.max(previous.to, selection.to);
    return merged;
  }, []);
}
