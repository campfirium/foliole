import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import {
  searchCompanionFullText,
  supportsCompanionExtendedSearch,
  type CompanionFullTextSearchResults,
  type CompanionTopicSearchResult
} from '../shared/platform/companionFullTextSearch';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';
import { appInputBorderFocusVisibleClassName } from '../shared/ui';

import { CompanionScreenHeader } from './CompanionScreenHeader';

const SEARCH_LIMIT = 20;

type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';
type ResourceStatus = CompanionTopicSearchResult['bodyStatus'] | CompanionExternalDocumentSearchResult['bodyStatus'];

export function CompanionSearchContent(props: { onOpenTopic?: ((nodeId: string) => void) | undefined }) {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const searchState = useCompanionSearch(query);

  return (
    <section className="px-1 pb-4 pt-3">
      <CompanionScreenHeader title={t('companion.tabs.search')} />
      <label className="block">
        <span className="sr-only">{t('companion.search.label')}</span>
        <input
          className={cn(
            'h-11 w-full rounded-md border border-companion-divider bg-companion-content px-4 text-base text-foreground transition placeholder:text-companion-text-secondary',
            appInputBorderFocusVisibleClassName
          )}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('companion.search.placeholder')}
          type="search"
          value={query}
        />
      </label>
      <div className="mt-4 border-t border-companion-divider pt-4">
        <SearchResults onOpenTopic={props.onOpenTopic} state={searchState} />
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

function SearchResults(props: {
  onOpenTopic?: ((nodeId: string) => void) | undefined;
  state: { results: CompanionFullTextSearchResults | null; status: SearchStatus };
}) {
  const t = useTranslation();
  const { results, status } = props.state;
  const hasResults = Boolean(
    results && (results.topics.length > 0 || results.pdf.length > 0 || results.external.length > 0)
  );
  if (status === 'loading') return <SearchMessage title={t('companion.search.loading')} />;
  if (status === 'error') return <SearchMessage title={t('companion.search.error')} />;
  if (status === 'ready' && !hasResults) return <SearchMessage title={t('companion.search.empty')} />;
  if (!results || !hasResults) {
    return <SearchIntro />;
  }
  return (
    <div className="space-y-5">
      <TopicResults
        onOpenTopic={props.onOpenTopic}
        results={results.topics}
        resourceStatusLabel={(value) => resourceStatusLabel(t, value)}
      />
      <PdfResults results={results.pdf} />
      <ExternalResults results={results.external} resourceStatusLabel={(value) => resourceStatusLabel(t, value)} />
    </div>
  );
}

function SearchMessage(props: { title: string }) {
  return <p className="py-2 text-sm leading-6 text-companion-text-secondary">{props.title}</p>;
}

function SearchIntro() {
  const t = useTranslation();
  const description = supportsCompanionExtendedSearch()
    ? t('companion.search.description')
    : t('companion.search.descriptionTopics');
  return (
    <div className="py-2 text-left">
      <h2 className="text-sm font-semibold leading-6 text-foreground/75">{t('companion.search.title')}</h2>
      <p className="mt-1 text-sm leading-6 text-companion-text-secondary">{description}</p>
    </div>
  );
}

function TopicResults(props: {
  onOpenTopic?: ((nodeId: string) => void) | undefined;
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
          onOpen={props.onOpenTopic ? () => { props.onOpenTopic?.(result.nodeId); } : undefined}
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

function SearchResultItem(props: {
  excerpt: string;
  onOpen?: (() => void) | undefined;
  status?: string | null;
  title: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-sm font-medium text-foreground">{props.title}</h3>
        {props.status ? <span className="shrink-0 text-xs text-companion-text-secondary">{props.status}</span> : null}
      </div>
      {props.excerpt ? <p className="mt-1 line-clamp-3 text-sm text-companion-text-secondary">{props.excerpt}</p> : null}
    </>
  );
  if (props.onOpen) {
    return (
      <button
        className="block w-full border-b border-companion-divider px-1 py-3 text-left transition-colors active:bg-companion-subtle/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={props.onOpen}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <article className="border-b border-companion-divider px-1 py-3">
      {content}
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
