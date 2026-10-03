import { useEffect, useRef, useState } from 'react';

import { searchCompanionFullText, type CompanionFullTextSearchResults, type CompanionSearchOffsets } from '../shared/platform/companionFullTextSearch';

const PAGE_SIZE = 20;
type Status = 'idle' | 'loading' | 'ready' | 'error';

function nextOffsets(results: CompanionFullTextSearchResults, previous: CompanionSearchOffsets = {}): CompanionSearchOffsets {
  return Object.fromEntries((['topics', 'pdf', 'external'] as const).map((kind) => [
    kind, results[kind].length < PAGE_SIZE ? null : (previous[kind] ?? 0) + results[kind].length
  ]));
}

export function useCompanionSearch(query: string) {
  const [results, setResults] = useState<CompanionFullTextSearchResults | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [offsets, setOffsets] = useState<CompanionSearchOffsets>({});
  const generation = useRef(0);
  const busy = useRef(false);
  const normalizedQuery = query.trim();
  useEffect(() => {
    const current = ++generation.current;
    busy.current = false;
    setResults(null);
    setOffsets({});
    setLoadingMore(false);
    setMoreError(false);
    setStatus(normalizedQuery ? 'loading' : 'idle');
    if (!normalizedQuery) return;
    searchCompanionFullText(normalizedQuery, PAGE_SIZE).then((page) => {
      if (generation.current !== current) return;
      setResults(page);
      setOffsets(nextOffsets(page));
      setStatus('ready');
    }).catch(() => {
      if (generation.current === current) setStatus('error');
    });
    return () => { generation.current += 1; };
  }, [normalizedQuery]);

  async function loadMore() {
    if (busy.current || !results) return;
    busy.current = true;
    setLoadingMore(true);
    setMoreError(false);
    const current = generation.current;
    try {
      const page = await searchCompanionFullText(normalizedQuery, PAGE_SIZE, offsets);
      if (generation.current !== current) return;
      setResults({
        ...page,
        topics: [...results.topics, ...page.topics],
        pdf: [...results.pdf, ...page.pdf],
        external: [...results.external, ...page.external]
      });
      setOffsets(nextOffsets(page, offsets));
    } catch {
      if (generation.current === current) setMoreError(true);
    } finally {
      if (generation.current === current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }
  return { results, status, loadMore, loadingMore, moreError, hasMore: Object.values(offsets).some((offset) => offset !== null) };
}
