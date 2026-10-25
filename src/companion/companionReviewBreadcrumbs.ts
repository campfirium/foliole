import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { buildBreadcrumbDisplayPath } from '../shared/lib/breadcrumbDisplayPath';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../shared/localization/systemEntryNames';

export interface CompanionReviewBreadcrumbItem {
  id: string;
  isCurrent?: boolean;
  label: string;
  targetNodeId: string;
}

export function buildReviewBreadcrumbItems(snapshot: WorkspaceSnapshot | null, currentNodeId: string | null, locale: Parameters<typeof resolveNodeDisplayTitle>[0] = 'en'): CompanionReviewBreadcrumbItem[] {
  if (!snapshot || !currentNodeId) {
    return [];
  }

  const currentNode = snapshot.nodesById[currentNodeId];
  return buildBreadcrumbDisplayPath(currentNodeId, snapshot.nodesById).map((item) => ({
    id: item.id,
    label: currentNode?.kind === 'item' && item.id === currentNode.parentNodeId
      ? '...' : compactBreadcrumbTitle(resolveNodeDisplayTitle(locale, item.id, snapshot.nodesById[item.id]?.title ?? item.title)),
    targetNodeId: item.targetNodeId
  }));
}

export function useReviewBreadcrumbItems(snapshot: WorkspaceSnapshot | null, currentNodeId: string | null) {
  const { locale } = useLocalization();
  return useMemo(() => buildReviewBreadcrumbItems(snapshot, currentNodeId, locale), [currentNodeId, locale, snapshot]);
}

function compactBreadcrumbTitle(title: string) {
  const firstWord = title.trim().split(/\s+/)[0] ?? '';
  return Array.from(firstWord).slice(0, 4).join('');
}
