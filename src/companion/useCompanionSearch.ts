import { useEffect, useState } from 'react';

import { searchCompanionFullTextSnapshot, type CompanionFullTextSearchResults } from '../shared/platform/companionFullTextSearch';

const PAGE_SIZE = 20;
type Status = 'idle' | 'loading' | 'ready' | 'error';

export function useCompanionSearch(query: string) {
  const [snapshot, setSnapshot] = useState<CompanionFullTextSearchResults | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [count, setCount] = useState(PAGE_SIZE);
  const [refresh, setRefresh] = useState(0);
  const normalizedQuery = query.trim();
  useEffect(() => {
    setSnapshot(null);
    setCount(PAGE_SIZE);
    setStatus(normalizedQuery ? 'loading' : 'idle');
    if (!normalizedQuery) return;
    const controller = new AbortController();
    searchCompanionFullTextSnapshot(normalizedQuery, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setSnapshot(next);
      setStatus('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('error');
    });
    return () => controller.abort();
  }, [normalizedQuery, refresh]);

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
