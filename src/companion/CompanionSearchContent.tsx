import { useEffect, useState } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import {
  searchCompanionFullText,
  type CompanionFullTextSearchResults
} from '../shared/platform/companionFullTextSearch';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';
import { appInputBorderFocusVisibleClassName } from '../shared/ui';

import { CompanionScreenHeader } from './CompanionScreenHeader';
import { CompanionSearchResults } from './CompanionSearchResults';

const SEARCH_LIMIT = 20;

type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';
export function CompanionSearchContent(props: {
  onOpenExternalDocument?: ((document: CompanionExternalDocumentSearchResult) => void) | undefined;
  onOpenPdf?: ((result: CompanionPdfPageTextSearchResult) => void) | undefined;
  onOpenTopic?: ((nodeId: string) => void) | undefined;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const searchState = useCompanionSearch(query);

  return (
    <section className="px-1 pb-4 pt-3" data-search-status={searchState.status}>
      <CompanionScreenHeader title={t('companion.tabs.search')} />
      <label className="block">
        <span className="sr-only">{t('companion.search.label')}</span>
        <input
          className={cn(
            'h-11 w-full rounded-md border border-companion-divider bg-companion-content px-4 text-base text-foreground transition placeholder:text-companion-text-secondary',
            appInputBorderFocusVisibleClassName
          )}
          data-testid="companion-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('companion.search.placeholder')}
          type="search"
          value={query}
        />
      </label>
      <div className="mt-4 border-t border-companion-divider pt-4">
        <CompanionSearchResults
          onOpenExternalDocument={props.onOpenExternalDocument}
          onOpenPdf={props.onOpenPdf}
          onOpenTopic={props.onOpenTopic}
          state={searchState}
        />
      </div>
    </section>
  );
}

function useCompanionSearch(query: string) {
  const [results, setResults] = useState<CompanionFullTextSearchResults | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const normalizedQuery = query.trim();
  useEffect(() => {
    if (!normalizedQuery) return resetSearch(setResults, setStatus);
    let cancelled = false;
    setStatus('loading');
    searchCompanionFullText(normalizedQuery, SEARCH_LIMIT)
      .then((nextResults) => {
        if (cancelled) return;
        setResults(nextResults);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setResults(null);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedQuery]);
  return { results, status };
}

function resetSearch(
  setResults: (results: CompanionFullTextSearchResults | null) => void,
  setStatus: (status: SearchStatus) => void
) {
  setResults(null);
  setStatus('idle');
}
