import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { buildBreadcrumbDisplayPath } from '../shared/lib/breadcrumbDisplayPath';
import { capBreadcrumbLabel } from '../shared/lib/breadcrumbLabel';
import { resolveClozeAnswerTexts, toBreadcrumbTitleText } from '../shared/lib/breadcrumbTitleText';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle } from '../shared/localization/systemEntryNames';

export interface CompanionReviewBreadcrumbItem {
  id: string;
  label: string;
  targetNodeId: string;
  title: string;
}

/** Ancestors of the open node, nearest last; the node itself is the page title and is not repeated.
 * A cloze's answer never shows in its ancestors' titles. */
export function buildReviewBreadcrumbItems(snapshot: WorkspaceSnapshot | null, currentNodeId: string | null, locale: Parameters<typeof resolveNodeDisplayTitle>[0] = 'en'): CompanionReviewBreadcrumbItem[] {
  if (!snapshot || !currentNodeId) {
    return [];
  }

  const hiddenAnswers = resolveClozeAnswerTexts(snapshot.nodesById[currentNodeId]);
  return buildBreadcrumbDisplayPath(currentNodeId, snapshot.nodesById).map((item) => {
    const rawTitle = resolveNodeDisplayTitle(locale, item.id, snapshot.nodesById[item.id]?.title ?? item.title).trim() || item.title;
    const title = toBreadcrumbTitleText(rawTitle, hiddenAnswers);
    return { id: item.id, label: capBreadcrumbLabel(title), targetNodeId: item.targetNodeId, title };
  });
}

export function useReviewBreadcrumbItems(snapshot: WorkspaceSnapshot | null, currentNodeId: string | null) {
  const { locale } = useLocalization();
  return useMemo(() => buildReviewBreadcrumbItems(snapshot, currentNodeId, locale), [currentNodeId, locale, snapshot]);
}
