import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { buildBreadcrumbDisplayPath } from '../shared/lib/breadcrumbDisplayPath';

export interface CompanionReviewBreadcrumbItem {
  id: string;
  isCurrent?: boolean;
  label: string;
  targetNodeId: string;
}

export function buildReviewBreadcrumbItems(snapshot: WorkspaceSnapshot | null, currentNodeId: string | null): CompanionReviewBreadcrumbItem[] {
  if (!snapshot || !currentNodeId) {
    return [];
  }

  return buildBreadcrumbDisplayPath(currentNodeId, snapshot.nodesById).map((item) => ({
    id: item.id,
    label: item.title,
    targetNodeId: item.targetNodeId
  }));
}

export function useReviewBreadcrumbItems(snapshot: WorkspaceSnapshot | null, currentNodeId: string | null) {
  return useMemo(() => buildReviewBreadcrumbItems(snapshot, currentNodeId), [currentNodeId, snapshot]);
}
