import { useCallback, useEffect, useMemo, useState } from 'react';

import type { NativeReadwiseSyncPreviewEntry } from '../../../lib/platform/nativeContract';
import { previewReadwiseReaderImportInRuntime } from '../../shared/platform/readwiseReaderImportRuntimeRepository';
import { AppStatusBadge } from '../../shared/ui';

import { ImportCatalogLayout } from './ImportCatalogLayout';
import { ImportCatalogListItem } from './ImportCatalogListItem';
import { IMPORT_CATALOG_SORT_OPTIONS, sortImportCatalogItems, type ImportCatalogSortKey } from './importCatalogOrdering';
import { matchesImportSearch } from './importManagementSearch';
import { renderImportMeta, renderImportOpening, renderImportTitle } from './ImportNodeListBits';
import { loadImportSourceWorkspaceSettings } from './importSourceWorkspaceSettings';

type ReadwiseArticleEntry = NativeReadwiseSyncPreviewEntry & {
  title: string;
};

function formatArticleStatus(entry: ReadwiseArticleEntry) {
  if (entry.status === 'blocked_deleted') {
    return 'Deleted';
  }
  if (entry.status === 'new') {
    return 'Not loaded';
  }
  if (entry.status === 'updated') {
    return 'Updated';
  }
  if (entry.status === 'unchanged') {
    return 'Tracked';
  }
  if (entry.status === 'off') {
    return 'Off';
  }
  return 'Failed';
}

function resolveArticleStatusTone(entry: ReadwiseArticleEntry) {
  if (entry.status === 'blocked_deleted' || entry.status === 'updated') {
    return 'warning' as const;
  }
  if (entry.status === 'unchanged') {
    return 'success' as const;
  }
  if (entry.status === 'failed') {
    return 'error' as const;
  }
  return 'neutral' as const;
}

function resolveArticleTitle(sourcePath: string) {
  const fileName = sourcePath.split(/[\\/]/).pop()?.trim();
  return fileName?.replace(/\.(md|markdown|html)$/i, '').trim() || sourcePath;
}

function formatHighlights(entry: ReadwiseArticleEntry) {
  if (entry.highlight_type === 'with_highlights') {
    return `${entry.detected_highlight_count} highlights`;
  }
  return 'No highlights';
}

function formatArticleMeta(entry: ReadwiseArticleEntry) {
  return `${formatHighlights(entry)} · ${entry.destination}`;
}

function getArticleOpening(entry: ReadwiseArticleEntry) {
  if (entry.detail) {
    return entry.detail;
  }
  if (entry.destination === 'external') {
    return 'Full content is tracked through the configured external document folder.';
  }
  if (entry.destination === 'inbox') {
    return 'This source can be loaded into Foliole from Watch Manager.';
  }
  return 'Readwise Reader is not set to load this source.';
}

function useReadwiseArticlesCatalog() {
  const [articles, setArticles] = useState<ReadwiseArticleEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadArticles = useCallback(async () => {
    setErrorMessage('');
    setIsLoading(true);
    try {
      const preview = await previewReadwiseReaderImportInRuntime(await loadImportSourceWorkspaceSettings());
      setArticles(
        (preview?.entries ?? [])
          .filter((entry) => entry.source_kind === 'articles')
          .map((entry) => ({ ...entry, title: resolveArticleTitle(entry.source_path) }))
      );
    } catch {
      setErrorMessage('Readwise Articles could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  return { articles, errorMessage, isLoading, loadArticles };
}

function useArticleListState(articles: ReadwiseArticleEntry[]) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<ImportCatalogSortKey>('dateImported');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const filteredArticles = useMemo(
    () =>
      sortImportCatalogItems(
        articles
          .filter((entry) => matchesImportSearch(query, [entry.title, entry.source_path, entry.status, entry.destination]))
          .map((entry) => ({
            entry,
            sortLastOpened: null,
            sortSaved: '',
            sortTitle: entry.title
          })),
        sortKey,
        sortDirection
      ).map(({ entry }) => entry),
    [articles, query, sortDirection, sortKey]
  );

  return { filteredArticles, query, setQuery, setSortDirection, setSortKey, sortDirection, sortKey };
}

export function ImportSourceWorkspaceReadwiseArticlesPage() {
  const { articles, errorMessage, isLoading, loadArticles } = useReadwiseArticlesCatalog();
  const listState = useArticleListState(articles);
  const countLabel = listState.filteredArticles.length === articles.length
    ? String(articles.length)
    : `${listState.filteredArticles.length} / ${articles.length}`;

  return (
    <div className="app-scrollbar flex min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-[1080px]:px-2">
      <ImportCatalogLayout
        countLabel={countLabel}
        emptyState={{ description: 'No Readwise articles discovered yet.', title: 'Readwise Articles is empty' }}
        errorState={errorMessage ? { description: 'Try again to load Readwise articles.', onRetry: loadArticles, title: errorMessage } : undefined}
        hasItems={listState.filteredArticles.length > 0}
        isLoading={isLoading}
        loadingState={{ description: 'Checking Readwise Reader catalog.', title: 'Loading Readwise Articles' }}
        onChangeQuery={listState.setQuery}
        onChangeSortDirection={listState.setSortDirection}
        onChangeSortKey={(value) => listState.setSortKey(value as ImportCatalogSortKey)}
        query={listState.query}
        searchLabel="Search Readwise articles"
        searchPlaceholder="Search Readwise articles"
        sortDirection={listState.sortDirection}
        sortKey={listState.sortKey}
        sortOptions={[...IMPORT_CATALOG_SORT_OPTIONS]}
        title="Readwise Articles"
      >
        {listState.filteredArticles.map((entry) => (
          <ImportCatalogListItem
            actions={<AppStatusBadge label={formatArticleStatus(entry)} tone={resolveArticleStatusTone(entry)} />}
            key={`${entry.source_kind}:${entry.source_path}`}
            meta={renderImportMeta(formatArticleMeta(entry))}
            summary={renderImportOpening(getArticleOpening(entry))}
            title={renderImportTitle(entry.title)}
          />
        ))}
      </ImportCatalogLayout>
    </div>
  );
}
