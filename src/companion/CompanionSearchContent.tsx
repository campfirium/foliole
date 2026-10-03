import { useState } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import type { CompanionTopicSearchResult } from '../shared/platform/companionFullTextSearch';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';
import { AppButton, appInputBorderFocusVisibleClassName } from '../shared/ui';

import { CompanionSearchResults } from './CompanionSearchResults';
import { useCompanionSearch } from './useCompanionSearch';
import { useCompanionSearchTopicOpen } from './useCompanionSearchTopicOpen';

export function CompanionSearchContent(props: {
  onOpenExternalDocument?: ((document: CompanionExternalDocumentSearchResult, query: string) => void) | undefined;
  onOpenPdf?: ((result: CompanionPdfPageTextSearchResult) => void) | undefined;
  onOpenTopic?: ((result: CompanionTopicSearchResult, query: string) => void) | undefined;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const searchState = useCompanionSearch(query);
  const topicOpen = useCompanionSearchTopicOpen(query, props.onOpenTopic);

  return (
    <section className="pb-4 pt-3" data-search-status={searchState.status}>
      <label className="block">
        <span className="sr-only">{t('companion.search.label')}</span>
        <input
          className={cn(
            'h-11 w-full rounded-none border-0 border-b border-companion-divider bg-transparent px-0 text-base text-foreground transition placeholder:text-companion-text-secondary',
            appInputBorderFocusVisibleClassName
          )}
          data-testid="companion-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('companion.search.placeholder')}
          type="search"
          value={query}
        />
      </label>
      {query.trim() ? <AppButton disabled={searchState.status === 'loading'} onClick={() => { topicOpen.cancel(); searchState.refresh(); }} variant="ghost">
        {t('companion.search.refresh')}
      </AppButton> : null}
      <div className="mt-4">
        {topicOpen.failed ? <p role="alert">{t('companion.search.unavailable')}</p> : null}
        <CompanionSearchResults
          onOpenExternalDocument={props.onOpenExternalDocument ? (result) => { topicOpen.cancel(); props.onOpenExternalDocument?.(result, query.trim()); } : undefined}
          onOpenPdf={props.onOpenPdf ? (result) => { topicOpen.cancel(); props.onOpenPdf?.(result); } : undefined}
          onOpenTopic={props.onOpenTopic ? (result) => { void topicOpen.open(result); } : undefined}
          state={searchState}
        />
        {searchState.hasMore ? (
          <AppButton className="mt-4 w-full" onClick={() => void searchState.loadMore()} variant="ghost">
            {t('companion.search.loadMore')}
          </AppButton>
        ) : null}
      </div>
    </section>
  );
}
