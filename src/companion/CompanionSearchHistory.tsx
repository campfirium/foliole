import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { resolveCompanionBrowseSnapshot } from '../shared/platform/companion/browse/companionBrowseSnapshot';
import { resolveCompanionOpenHistory } from '../shared/platform/companionOpenHistory';

import { CompanionListViewport } from './CompanionListViewport';
import { RecentArticleRow } from './CompanionRecentArticleList';

/** Shown on the search page before a query is typed, so recently opened materials are one tap away. */
export function CompanionSearchHistory(props: {
  onOpen(nodeId: string, title: string): void;
  snapshot: WorkspaceSnapshot | null;
}) {
  const t = useTranslation();
  const browseSnapshot = resolveCompanionBrowseSnapshot(props.snapshot);
  const history = useMemo(() => resolveCompanionOpenHistory(browseSnapshot), [browseSnapshot]);
  if (history.length === 0) return null;
  return (
    <section className="mt-5" data-testid="companion-search-history">
      <h2 className="pb-1 text-sm font-semibold leading-6 text-foreground/75">{t('companion.search.history')}</h2>
      <CompanionListViewport viewKey="search-history" items={history}
        getItemKey={(article) => article.nodeId} estimateSize={() => 124}
        renderItem={(article) => <RecentArticleRow first={article === history[0]} article={article}
          currentArticleId={null} onSelectArticle={(nodeId) => props.onOpen(nodeId, article.title)} />} />
    </section>
  );
}
