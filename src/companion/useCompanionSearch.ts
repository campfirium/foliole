import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import {
  getCompanionExternalVisibility, subscribeCompanionExternalVisibility, wasCompanionExternalFolderHidden
} from '../shared/platform/companion/sync/companionExternalVisibility';
import { searchCompanionFullTextSnapshot, type CompanionFullTextSearchResults } from '../shared/platform/companionFullTextSearch';

const PAGE_SIZE = 20;
type Status = 'idle' | 'loading' | 'ready' | 'error';
type Snapshot = { scope: object; revision: number; results: CompanionFullTextSearchResults };

export function useCompanionSearch(query: string) {
  const scope = useSyncExternalStore(subscribeCompanionReadingScope, getCompanionReadingScope);
  const visibility = useSyncExternalStore(subscribeCompanionExternalVisibility, getCompanionExternalVisibility);
  const [loaded, setLoaded] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [count, setCount] = useState(PAGE_SIZE);
  const [refresh, setRefresh] = useState(0);
  const normalizedQuery = query.trim();
  useEffect(() => {
    setLoaded(null);
    setCount(PAGE_SIZE);
    setStatus(normalizedQuery ? 'loading' : 'idle');
    if (!normalizedQuery) return;
    const controller = new AbortController();
    const { revision } = getCompanionExternalVisibility();
    searchCompanionFullTextSnapshot(normalizedQuery, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setLoaded({ scope, revision, results: next });
      setStatus('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('error');
    });
    return () => controller.abort();
  }, [normalizedQuery, refresh, scope]);

  const snapshot = useMemo(() => {
    if (loaded?.scope !== scope) return null;
    if (loaded.revision === visibility.revision) return loaded.results;
    return { ...loaded.results, external: loaded.results.external.filter(result =>
      !wasCompanionExternalFolderHidden(result.folder_id, loaded.revision, visibility)) };
  }, [loaded, scope, visibility]);
  const results = snapshot ? {
    ...snapshot,
    topics: snapshot.topics.slice(0, count),
    pdf: snapshot.pdf.slice(0, count),
    external: snapshot.external.slice(0, count)
  } : null;
  return {
    results, status,
    loadMore: () => setCount((current) => current + PAGE_SIZE),
    refresh: () => setRefresh((current) => current + 1),
    hasMore: Boolean(snapshot && Math.max(snapshot.topics.length, snapshot.pdf.length, snapshot.external.length) > count)
  };
}
