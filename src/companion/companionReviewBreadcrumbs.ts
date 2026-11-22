import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { buildBreadcrumbDisplayPath } from '../shared/lib/breadcrumbDisplayPath';
import { capBreadcrumbLabel } from '../shared/lib/breadcrumbLabel';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../shared/localization/systemEntryNames';

export interface CompanionReviewBreadcrumbItem {
  id: string;
  label: string;
  targetNodeId: string;
  title: string;
}

/** Ancestors of the open node, nearest last; the node itself is the page title and is not repeated. */
export function buildReviewBreadcrumbItems(snapshot: WorkspaceSnapshot | null, currentNodeId: string | null, locale: Parameters<typeof resolveNodeDisplayTitle>[0] = 'en'): CompanionReviewBreadcrumbItem[] {
  if (!snapshot || !currentNodeId) {
    return [];
  }

  return buildBreadcrumbDisplayPath(currentNodeId, snapshot.nodesById).map((item) => {
    const title = resolveNodeDisplayTitle(locale, item.id, snapshot.nodesById[item.id]?.title ?? item.title).trim() || item.title;
    return { id: item.id, label: capBreadcrumbLabel(title), targetNodeId: item.targetNodeId, title };
  });
}

export function useReviewBreadcrumbItems(snapshot: WorkspaceSnapshot | null, currentNodeId: string | null) {
  const { locale } = useLocalization();
  return useMemo(() => buildReviewBreadcrumbItems(snapshot, currentNodeId, locale), [currentNodeId, locale, snapshot]);
}
