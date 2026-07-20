import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionExternalDocumentSearchResult } from '../shared/platform/companionExternalDocuments';
import {
  supportsCompanionExtendedSearch,
  type CompanionFullTextSearchResults,
  type CompanionTopicSearchResult
} from '../shared/platform/companionFullTextSearch';
import type { CompanionPdfPageTextSearchResult } from '../shared/platform/companionSyncObjects';

type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';
type ResourceStatus = CompanionTopicSearchResult['bodyStatus'] | CompanionExternalDocumentSearchResult['bodyStatus'];

export function CompanionSearchResults(props: {
  onOpenExternalDocument?: ((document: CompanionExternalDocumentSearchResult) => void) | undefined;
  onOpenPdf?: ((result: CompanionPdfPageTextSearchResult) => void) | undefined;
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
  if (!results || !hasResults) return <SearchIntro />;
  return (
    <div className="space-y-5">
      <TopicResults onOpenTopic={props.onOpenTopic} results={results.topics} />
      <PdfResults onOpen={props.onOpenPdf} results={results.pdf} />
      <ExternalResults onOpen={props.onOpenExternalDocument} results={results.external} />
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
          onOpen={props.onOpenTopic ? () => props.onOpenTopic?.(result.nodeId) : undefined}
          status={resourceStatusLabel(t, result.bodyStatus)}
          title={result.title || t('companion.search.untitledTopic')}
        />
      ))}
    </ResultSection>
  );
}

function PdfResults(props: {
  onOpen?: ((result: CompanionPdfPageTextSearchResult) => void) | undefined;
  results: CompanionPdfPageTextSearchResult[];
}) {
  const t = useTranslation();
  if (props.results.length === 0) return null;
  return (
    <ResultSection title={t('companion.search.section.pdf')}>
      {props.results.map((result) => (
        <SearchResultItem
          excerpt={result.excerpt || result.text}
          key={`${result.attachment_id}:${result.page}:${result.match_start}`}
          onOpen={props.onOpen ? () => props.onOpen?.(result) : undefined}
          title={t('companion.search.pdfPage', { page: result.page })}
        />
      ))}
    </ResultSection>
  );
}

function ExternalResults(props: {
  onOpen?: ((document: CompanionExternalDocumentSearchResult) => void) | undefined;
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
          onOpen={props.onOpen ? () => props.onOpen?.(result) : undefined}
          status={resourceStatusLabel(t, result.bodyStatus)}
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

function SearchResultItem(props: { excerpt: string; onOpen?: (() => void) | undefined; status?: string | null; title: string }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-sm font-medium text-foreground">{props.title}</h3>
        {props.status ? <span className="shrink-0 text-xs text-companion-text-secondary">{props.status}</span> : null}
      </div>
      {props.excerpt ? <p className="mt-1 line-clamp-3 text-sm text-companion-text-secondary">{props.excerpt}</p> : null}
    </>
  );
  if (!props.onOpen) return <article className="border-b border-companion-divider px-1 py-3">{content}</article>;
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

function resourceStatusLabel(t: ReturnType<typeof useTranslation>, status: ResourceStatus) {
  if (status === 'missing') return t('companion.search.status.missing');
  if (status === 'fetching') return t('companion.search.status.fetching');
  if (status === 'failed') return t('companion.search.status.failed');
  if (status === 'empty') return t('companion.search.status.empty');
  return null;
}
