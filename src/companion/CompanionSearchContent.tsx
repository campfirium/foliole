import { useState } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import type { CompanionTopicSearchResult } from '../shared/platform/companionFullTextSearch';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';
import { AppButton, appInputBorderFocusVisibleClassName } from '../shared/ui';

import { CompanionSearchResults } from './CompanionSearchResults';
import { useCompanionSearch } from './useCompanionSearch';

export function CompanionSearchContent(props: {
  onOpenExternalDocument?: ((document: CompanionExternalDocumentSearchResult, query: string) => void) | undefined;
  onOpenPdf?: ((result: CompanionPdfPageTextSearchResult) => void) | undefined;
  onOpenTopic?: ((result: CompanionTopicSearchResult, query: string) => void) | undefined;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const searchState = useCompanionSearch(query);

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
      <div className="mt-4">
        <CompanionSearchResults
          onOpenExternalDocument={props.onOpenExternalDocument ? (result) => props.onOpenExternalDocument?.(result, query.trim()) : undefined}
          onOpenPdf={props.onOpenPdf}
          onOpenTopic={props.onOpenTopic ? (result) => props.onOpenTopic?.(result, query.trim()) : undefined}
          state={searchState}
        />
        {searchState.moreError ? <p role="alert" className="py-2 text-sm text-companion-text-secondary">{t('companion.search.error')}</p> : null}
        {searchState.hasMore ? (
          <AppButton className="mt-4 w-full" disabled={searchState.loadingMore} onClick={() => void searchState.loadMore()} variant="ghost">
            {t(searchState.loadingMore ? 'companion.search.loading' : 'companion.search.loadMore')}
          </AppButton>
        ) : null}
      </div>
    </section>
  );
}
