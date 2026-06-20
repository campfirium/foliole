import type { Node } from '../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import type { WorkspacePersistedState } from '../store/workspaceStore';

import type { DemoMarkdownImportEntry } from './demoMarkdownImport';

const DEFAULT_READING_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_READING_PRIORITY = 0.5;

export interface ImportNodeBuildResult {
  ignoredCount: number;
  nodes: Node[];
  rootNodeId: string;
  topicNodeIds: string[];
}

export function appendManualChildOrder(node: Node | undefined, childNodeId: string, nowIso: string): Node {
  if (!node) {
    return createFolderNode(INBOX_NODE_ID, null, 'Inbox', nowIso);
  }
  return {
    ...node,
    manualChildOrder: [...new Set([...(node.manualChildOrder ?? []), childNodeId])],
    updatedAt: nowIso
  };
}

export function buildImportNodes(
  state: WorkspacePersistedState,
  entries: DemoMarkdownImportEntry[],
  nowIso: string
): ImportNodeBuildResult {
  const batchId = createBatchId(nowIso, state.nodeOrder);
  const rootNodeId = `demo-local-${batchId}`;
  const rootTitle = uniqueTitle('Imported Markdown', INBOX_NODE_ID, state.nodesById);
  const rootNode = createFolderNode(rootNodeId, INBOX_NODE_ID, rootTitle, nowIso);
  const nodes: Node[] = [rootNode];
  const folderIdByPath = new Map<string, string>();
  const topicNodeIds: string[] = [];
  let ignoredCount = 0;

  entries.forEach((entry, index) => {
    const markdown = entry.markdown.trim();
    if (!markdown) {
      ignoredCount += 1;
      return;
    }
    const pathSegments = getRelativePathSegments(entry);
    const parentNodeId = ensureFoldersForPath({
      batchId,
      folderIdByPath,
      index,
      nodes,
      nowIso,
      pathSegments: pathSegments.slice(0, -1),
      rootNode
    });
    const title = uniqueTitle(resolveTopicTitle(markdown, pathSegments.at(-1) ?? entry.sourceName), parentNodeId, {
      ...state.nodesById,
      ...Object.fromEntries(nodes.map((node) => [node.id, node]))
    });
    const topicNode = createTopicNode(`demo-local-${batchId}-topic-${index}`, parentNodeId, title, markdown, nowIso);
    nodes.push(topicNode);
    topicNodeIds.push(topicNode.id);
  });

  updateFolderOrders(nodes);
  return { ignoredCount, nodes, rootNodeId, topicNodeIds };
}

function ensureFoldersForPath(args: {
  batchId: string;
  folderIdByPath: Map<string, string>;
  index: number;
  nodes: Node[];
  nowIso: string;
  pathSegments: string[];
  rootNode: Node;
}) {
  let parentNode = args.rootNode;
  let currentPath = '';
  args.pathSegments.forEach((segment, segmentIndex) => {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const existingId = args.folderIdByPath.get(currentPath);
    if (existingId) {
      parentNode = args.nodes.find((node) => node.id === existingId) ?? parentNode;
      return;
    }
    const folderId = `demo-local-${args.batchId}-folder-${args.index}-${segmentIndex}`;
    const folderNode = createFolderNode(folderId, parentNode.id, segment, args.nowIso);
    args.nodes.push(folderNode);
    args.folderIdByPath.set(currentPath, folderId);
    parentNode = folderNode;
  });
  return parentNode.id;
}

function updateFolderOrders(nodes: Node[]) {
  const childIdsByParent = new Map<string, string[]>();
  nodes.forEach((node) => {
    if (!node.parentNodeId) return;
    childIdsByParent.set(node.parentNodeId, [...(childIdsByParent.get(node.parentNodeId) ?? []), node.id]);
  });
  nodes.forEach((node) => {
    if (node.kind === 'folder') {
      node.manualChildOrder = childIdsByParent.get(node.id) ?? [];
    }
  });
}

function createFolderNode(id: string, parentNodeId: string | null, title: string, nowIso: string): Node {
  return {
    id,
    parentNodeId,
    kind: 'folder',
    title,
    isTitleManual: true,
    manualChildOrder: [],
    content: '',
    openingText: null,
    reveal: null,
    review: null,
    reading: null,
    bodyStatus: 'empty',
    hasContent: false,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function createTopicNode(id: string, parentNodeId: string, title: string, content: string, nowIso: string): Node {
  return {
    id,
    parentNodeId,
    kind: 'topic',
    title,
    isTitleManual: true,
    content,
    openingText: null,
    reveal: null,
    review: null,
    reading: {
      intervalDurationMs: DEFAULT_READING_INTERVAL_MS,
      intervalGrowthFactor: 2,
      lastHandledAt: nowIso,
      nextAt: nowIso,
      priority: DEFAULT_READING_PRIORITY,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'active'
    },
    bodyStatus: 'ready',
    hasContent: true,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function resolveTopicTitle(markdown: string, fallback: string | undefined) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const fallbackTitle = fallback?.replace(/\.(md|txt)$/i, '').trim();
  return fallbackTitle && fallbackTitle.length > 0 ? fallbackTitle : 'Imported Markdown';
}

function uniqueTitle(title: string, parentNodeId: string, nodesById: Record<string, Node | undefined>) {
  const siblingTitles = new Set(
    Object.values(nodesById)
      .filter((node): node is Node => Boolean(node && node.parentNodeId === parentNodeId))
      .map((node) => node.title)
  );
  if (!siblingTitles.has(title)) return title;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${title} ${index}`;
    if (!siblingTitles.has(candidate)) return candidate;
  }
  return `${title} ${Date.now()}`;
}

function getRelativePathSegments(entry: DemoMarkdownImportEntry) {
  const path = normalizeRelativePath(entry.relativePath ?? entry.sourceName ?? '');
  return path ? path.split('/').filter(Boolean) : [resolveTopicTitle(entry.markdown, entry.sourceName)];
}

export function normalizeRelativePath(path: string) {
  return path.replace(/\\/g, '/').split('/').map((segment) => segment.trim()).filter(Boolean).join('/');
}

export function isMarkdownFileName(name: string) {
  return name.toLowerCase().endsWith('.md');
}

export function isHiddenPath(path: string) {
  return path.split('/').some((segment) => segment.startsWith('.'));
}

function createBatchId(nowIso: string, nodeOrder: string[]) {
  const suffix = nodeOrder.length.toString(36);
  return `${nowIso.replace(/[^0-9]/g, '').slice(0, 14)}-${suffix}`;
}
