import type { ReactNode } from 'react';

import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { appFloatingMetaBadgeClassName } from '../../shared/ui';

import type { WorkspaceSearchResult } from './workspaceSearch';

function normalizeQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

function buildSegments(text: string, query: string) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return [{ matched: false, text }];
  }
  const normalizedText = text.toLocaleLowerCase();
  const segments: Array<{ matched: boolean; text: string }> = [];
  let cursor = 0;
  while (cursor < text.length) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
    if (matchIndex < 0) {
      segments.push({ matched: false, text: text.slice(cursor) });
      break;
    }
    if (matchIndex > cursor) {
      segments.push({ matched: false, text: text.slice(cursor, matchIndex) });
    }
    const nextCursor = matchIndex + normalizedQuery.length;
    segments.push({ matched: true, text: text.slice(matchIndex, nextCursor) });
    cursor = nextCursor;
  }
  return segments.filter((segment) => segment.text.length > 0);
}

export function renderSearchResultText(text: string, query: string) {
  return buildSegments(text, query).map((segment, index) =>
    segment.matched ? (
      <span
        className="font-semibold"
        key={`${segment.text}-${index}`}
        style={{ color: 'var(--app-accent-color)' }}
      >
        {segment.text}
      </span>
    ) : (
      <span key={`${segment.text}-${index}`}>{segment.text}</span>
    )
  );
}

function buildAncestorTitles(
  nodeId: string,
  nodesById: Record<string, WorkspaceListNode | undefined>
) {
  const titles: string[] = [];
  let currentNode = nodesById[nodeId];
  while (currentNode?.parentNodeId) {
    const parentNode = nodesById[currentNode.parentNodeId];
    if (!parentNode) {
      break;
    }
    titles.unshift(parentNode.title.trim() || 'Untitled');
    currentNode = parentNode;
  }
  return titles;
}

export function resolveSearchResultPathLabel(
  result: WorkspaceSearchResult,
  nodesById: Record<string, WorkspaceListNode | undefined>
) {
  if (result.kind === 'external' && result.externalMatch) {
    return result.externalMatch.relativePath;
  }
  const titles = buildAncestorTitles(result.id, nodesById);
  return titles.length > 0 ? titles.join(' / ') : 'Top level';
}

export function resolveSearchResultContext(result: WorkspaceSearchResult) {
  return result.excerpt;
}

export function resolveSearchResultNodeBadge(
  result: WorkspaceSearchResult,
  nodesById: Record<string, WorkspaceListNode | undefined>
) {
  if (result.kind === 'external') {
    return 'External';
  }
  const anchorKind = nodesById[result.id]?.anchorLink?.kind;
  if (anchorKind === 'highlight') {
    return 'Highlight';
  }
  if (anchorKind === 'cloze') {
    return 'Cloze';
  }
  return null;
}

function resolveWatchedFolderFallback(details: RuntimeNodeSourceDetails) {
  const pathValue = details.keepImportItem?.primaryPath?.trim();
  if (!pathValue) {
    return 'Watched folder';
  }
  const normalizedPath = pathValue.replace(/\\/g, '/');
  const segments = normalizedPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? pathValue;
}

export function resolveSearchResultSourceLabel(
  details: RuntimeNodeSourceDetails | null | undefined
) {
  if (!details) {
    return null;
  }
  if (details.keepImportItem?.sourceType === 'readwise') {
    return 'Readwise';
  }
  if (details.keepImportItem?.sourceType === 'generic') {
    return details.keepImportItem.ruleLabel?.trim() || resolveWatchedFolderFallback(details);
  }
  return null;
}

export function renderSearchResultSourceLabel(
  details: RuntimeNodeSourceDetails | null | undefined
): ReactNode {
  const label = resolveSearchResultSourceLabel(details);
  if (!label) {
    return null;
  }
  return <span className={appFloatingMetaBadgeClassName('text-[11px]')}>{label}</span>;
}

export function renderSearchResultMetaBadge(label: string | null): ReactNode {
  if (!label) {
    return null;
  }
  return <span className={appFloatingMetaBadgeClassName('text-[11px]')}>{label}</span>;
}

export function resolveExternalFolderLabel(result: WorkspaceSearchResult) {
  if (result.kind !== 'external' || !result.externalMatch) {
    return null;
  }
  const normalizedPath = result.externalMatch.folderPath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? result.externalMatch.folderPath;
}
