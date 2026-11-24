import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import type { CompanionTopicSearchResult } from '../shared/platform/companionFullTextSearch';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';
import { AppButton, appFocusSilentClassName } from '../shared/ui';

import { useCompanionNavigationField } from './CompanionNavigationProvider';
import { CompanionSearchHistory } from './CompanionSearchHistory';
import { CompanionSearchResults } from './CompanionSearchResults';
import { CompanionSearchSaveIndex } from './CompanionSearchSaveIndex';
import { useCompanionSearch } from './useCompanionSearch';
import { useCompanionSearchTopicOpen } from './useCompanionSearchTopicOpen';

export function CompanionSearchContent(props: {
  onOpenExternalDocument?: ((document: CompanionExternalDocumentSearchResult, query: string) => void) | undefined;
  onOpenPdf?: ((result: CompanionPdfPageTextSearchResult) => void) | undefined;
  onOpenTopic?: ((result: CompanionTopicSearchResult, query: string) => void) | undefined;
  snapshot?: WorkspaceSnapshot | null | undefined;
}) {
  const t = useTranslation();
  const [query, setQuery] = useCompanionNavigationField('searchQuery', '');
  const searchState = useCompanionSearch(query);
  const topicOpen = useCompanionSearchTopicOpen(query, props.onOpenTopic);

  return (
    <section className="companion-page-start pb-4" data-search-status={searchState.status}>
      <label className="block">
        <span className="sr-only">{t('companion.search.label')}</span>
        <input
          className={cn(
            'h-11 w-full rounded-none border-0 border-b border-companion-divider bg-transparent px-0 text-base text-foreground transition placeholder:text-companion-text-secondary',
            appFocusSilentClassName,
            'focus-visible:border-companion-accent'
          )}
          data-testid="companion-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('companion.search.placeholder')}
          type="search"
          value={query}
        />
      </label>
      <CompanionSearchSaveIndex query={query} />
      <div className="mt-4">
        {topicOpen.failed ? <p role="alert">{t('companion.search.unavailable')}</p> : null}
        <CompanionSearchResults
          onOpenExternalDocument={props.onOpenExternalDocument ? (result) => { topicOpen.cancel(); props.onOpenExternalDocument?.(result, query.trim()); } : undefined}
          onOpenPdf={props.onOpenPdf ? (result) => { topicOpen.cancel(); props.onOpenPdf?.(result); } : undefined}
          onOpenTopic={props.onOpenTopic ? (result) => { void topicOpen.open(result); } : undefined}
          onRetry={() => { topicOpen.cancel(); searchState.refresh(); }}
          state={searchState}
        />
        {searchState.hasMore ? (
          <AppButton className="mt-4 w-full" onClick={() => void searchState.loadMore()} variant="ghost">
            {t('companion.search.loadMore')}
          </AppButton>
        ) : null}
        {!query.trim() && props.onOpenTopic ? <CompanionSearchHistory snapshot={props.snapshot ?? null}
          onOpen={(nodeId, title) => void topicOpen.open(historyTopic(nodeId, title))} /> : null}
      </div>
    </section>
  );
}

function historyTopic(nodeId: string, title: string): CompanionTopicSearchResult {
  return { bodyStatus: 'ready', excerpt: '', matchStart: 0, nodeId, openingText: null, title, updatedAt: '' };
}
