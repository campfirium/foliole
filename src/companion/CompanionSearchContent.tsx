import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import {
  searchCompanionFullText,
  type CompanionFullTextSearchResults,
  type CompanionTopicSearchResult
} from '../shared/platform/companionFullTextSearch';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';
import { AppEmptyState, appInputBorderFocusVisibleClassName } from '../shared/ui';

const SEARCH_LIMIT = 20;

type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';
type ResourceStatus = CompanionTopicSearchResult['bodyStatus'] | CompanionExternalDocumentSearchResult['bodyStatus'];

export function CompanionSearchContent() {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const searchState = useCompanionSearch(query);

  return (
    <section className="px-1 py-4">
      <label className="block">
        <span className="sr-only">{t('companion.search.label')}</span>
        <input
          className={cn(
            'h-12 w-full rounded-md border border-companion-divider bg-companion-content px-4 text-base text-foreground transition placeholder:text-companion-text-secondary',
            appInputBorderFocusVisibleClassName
          )}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('companion.search.placeholder')}
          type="search"
          value={query}
        />
      </label>
      <div className="mt-6 border-t border-companion-divider py-5">
        <SearchResults state={searchState} />
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

function SearchResults(props: { state: { results: CompanionFullTextSearchResults | null; status: SearchStatus } }) {
  const t = useTranslation();
  const { results, status } = props.state;
  const hasResults = Boolean(
    results && (results.topics.length > 0 || results.pdf.length > 0 || results.external.length > 0)
  );
  if (status === 'loading') return <SearchMessage title={t('companion.search.loading')} />;
  if (status === 'error') return <SearchMessage title={t('companion.search.error')} />;
  if (status === 'ready' && !hasResults) return <SearchMessage title={t('companion.search.empty')} />;
  if (!results || !hasResults) {
    return (
      <AppEmptyState
        className="min-h-0 items-start py-1 text-left text-companion-text-secondary"
        description={t('companion.search.description')}
        title={t('companion.search.title')}
      />
    );
  }
  return (
    <div className="space-y-5">
      <TopicResults results={results.topics} resourceStatusLabel={(value) => resourceStatusLabel(t, value)} />
      <PdfResults results={results.pdf} />
      <ExternalResults results={results.external} resourceStatusLabel={(value) => resourceStatusLabel(t, value)} />
    </div>
  );
}

function SearchMessage(props: { title: string }) {
  return <p className="text-sm text-companion-text-secondary">{props.title}</p>;
}

function TopicResults(props: {
  resourceStatusLabel: (status: ResourceStatus) => string | null;
  results: CompanionTopicSearchResult[];
}) {
  const t = useTranslation();
  if (props.results.length === 0) return null;
  return (
    <ResultSection title={t('companion.search.section.topics')}>
      {props.results.map((result) => (
        <SearchResultItem
          excerpt={result.excerpt || result.openingText || ''}
          key={result.nodeId}
          status={props.resourceStatusLabel(result.bodyStatus)}
          title={result.title || t('companion.search.untitledTopic')}
        />
      ))}
    </ResultSection>
  );
}

function PdfResults(props: { results: CompanionPdfPageTextSearchResult[] }) {
  const t = useTranslation();
  if (props.results.length === 0) return null;
  return (
    <ResultSection title={t('companion.search.section.pdf')}>
      {props.results.map((result) => (
        <SearchResultItem
          excerpt={result.excerpt || result.text}
          key={`${result.attachment_id}:${result.page}:${result.match_start}`}
          title={t('companion.search.pdfPage', { page: result.page })}
        />
      ))}
    </ResultSection>
  );
}

function ExternalResults(props: {
  resourceStatusLabel: (status: ResourceStatus) => string | null;
  results: CompanionExternalDocumentSearchResult[];
}) {
  const t = useTranslation();
  if (props.results.length === 0) return null;
  return (
    <ResultSection title={t('companion.search.section.external')}>
      {props.results.map((result) => (
        <SearchResultItem
          excerpt={result.excerpt || result.opening_text || result.relative_path}
          key={result.document_id}
          status={props.resourceStatusLabel(result.bodyStatus)}
          title={result.title || result.file_name}
        />
      ))}
    </ResultSection>
  );
}

function ResultSection(props: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase text-companion-text-secondary">{props.title}</h2>
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}

function SearchResultItem(props: { excerpt: string; status?: string | null; title: string }) {
  return (
    <article className="rounded-md border border-companion-divider bg-companion-content px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-sm font-medium text-foreground">{props.title}</h3>
        {props.status ? <span className="shrink-0 text-xs text-companion-text-secondary">{props.status}</span> : null}
      </div>
      {props.excerpt ? <p className="mt-1 line-clamp-3 text-sm text-companion-text-secondary">{props.excerpt}</p> : null}
    </article>
  );
}

function resourceStatusLabel(t: ReturnType<typeof useTranslation>, status: ResourceStatus) {
  if (status === 'missing') return t('companion.search.status.missing');
  if (status === 'fetching') return t('companion.search.status.fetching');
  if (status === 'failed') return t('companion.search.status.failed');
  if (status === 'empty') return t('companion.search.status.empty');
  return null;
}
