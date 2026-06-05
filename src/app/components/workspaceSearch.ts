import { buildNodeBreadcrumbs } from '../../features/nodes/model/nodeBreadcrumbs';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { translate } from '../../shared/localization/translations';
import type { RuntimeRemovedSourceEntry } from '../../shared/platform/removedSourcesRuntimeRepository';

export interface WorkspaceSearchResult {
  excerpt: string;
  id: string;
  kind: 'external' | 'node' | 'pdf' | 'removed';
  externalMatch: {
    absolutePath: string;
    folderId: string;
    folderPath: string;
    importedNodeId?: string | null;
    query: string;
    relativePath: string;
  } | null;
  nodeMatch: {
    from: number;
    query: string;
    to: number;
  } | null;
  pdfMatch: {
    attachmentId: string;
    matchStart: number;
    page: number;
    pageTextLength: number;
    query: string;
  } | null;
  removedMatch?: {
    entry: RuntimeRemovedSourceEntry;
    query: string;
  } | null;
  title: string;
  updatedAt: string;
}

const MAX_RESULTS = 40;
const EXCERPT_PADDING = 36;
const EXCERPT_LENGTH = 96;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function untitledLabel() {
  return translate(getStoredAppLocale(), 'desktop.search.context.untitled');
}

function buildExcerpt(content: string, query: string) {
  const normalizedContent = normalizeWhitespace(content);
  if (!normalizedContent) {
    return translate(getStoredAppLocale(), 'desktop.search.context.noPreview');
  }
  const matchIndex = normalizedContent.toLowerCase().indexOf(query);
  if (matchIndex === -1) {
    return normalizedContent.slice(0, EXCERPT_LENGTH);
  }
  const start = Math.max(0, matchIndex - EXCERPT_PADDING);
  const end = Math.min(normalizedContent.length, matchIndex + query.length + EXCERPT_PADDING);
  return `${start > 0 ? '...' : ''}${normalizedContent.slice(start, end)}${end < normalizedContent.length ? '...' : ''}`;
}

function buildPathLabel(node: WorkspaceListNode, nodesById: Record<string, WorkspaceListNode>) {
  const breadcrumbItems = buildNodeBreadcrumbs(node.parentNodeId, nodesById);
  if (!breadcrumbItems.length) {
    return translate(getStoredAppLocale(), 'desktop.search.context.topLevel');
  }
  return breadcrumbItems.map((item) => item.title.trim() || untitledLabel()).join(' / ');
}

function buildRemovedExcerpt(entry: RuntimeRemovedSourceEntry, query: string) {
  return buildExcerpt(entry.content ?? entry.contentPreview ?? entry.sourcePath, query);
}

export function buildRemovedWorkspaceSearchResults(
  entries: RuntimeRemovedSourceEntry[],
  query: string
): WorkspaceSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  return entries
    .filter((entry) =>
      [entry.title, entry.sourcePath, entry.content ?? '', entry.contentPreview ?? ''].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    )
    .slice(0, MAX_RESULTS)
    .map((entry) => ({
      excerpt: buildRemovedExcerpt(entry, normalizedQuery),
      externalMatch: null,
      id: entry.id,
      kind: 'removed' as const,
      nodeMatch: null,
      pdfMatch: null,
      removedMatch: { entry, query: normalizedQuery },
      title: entry.title,
      updatedAt: entry.deletedAt
    }));
}

export function buildWorkspaceSearchResults(
  nodeOrder: string[],
  nodesById: Record<string, WorkspaceListNode | undefined>,
  trashedNodeIds: string[],
  query: string
): WorkspaceSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const availableNodesById = Object.fromEntries(
    Object.entries(nodesById).filter((entry): entry is [string, WorkspaceListNode] => Boolean(entry[1]))
  );
  const trashedNodeSet = new Set(trashedNodeIds);
  const results: WorkspaceSearchResult[] = [];

  for (const nodeId of nodeOrder) {
    if (trashedNodeSet.has(nodeId)) {
      continue;
    }
    const node = nodesById[nodeId];
    if (!node) {
      continue;
    }
    const title = normalizeWhitespace(node.title) || untitledLabel();
    const path = buildPathLabel(node, availableNodesById);
    const haystack = `${title}\n${path}`.toLowerCase();
    if (!haystack.includes(normalizedQuery)) {
      continue;
    }
    results.push({
      excerpt: path,
      externalMatch: null,
      id: node.id,
      kind: 'node',
      nodeMatch: null,
      pdfMatch: null,
      title,
      updatedAt: node.updatedAt
    });
    if (results.length >= MAX_RESULTS) {
      break;
    }
  }

  return results;
}
