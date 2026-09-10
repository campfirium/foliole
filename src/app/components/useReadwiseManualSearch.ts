import { useEffect, useRef, useState } from 'react';

import type { NativeReadwiseManualSource } from '../../../lib/platform/nativeReadwiseManualImportContract';
import {
  importReadwiseManualSourceInRuntime,
  prepareReadwiseManualSearchInRuntime,
  searchReadwiseManualSourcesInRuntime
} from '../../shared/platform/import/readwiseManualImportRuntimeRepository';

export function useReadwiseManualSearch() {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<NativeReadwiseManualSource[]>([]);
  const [ready, setReady] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    void prepareReadwiseManualSearchInRuntime().then((result) => {
      if (!cancelled) setReady(result.status === 'ready');
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; generation.current += 1; };
  }, []);
  async function search(value = query) {
    const request = ++generation.current;
    setError(false);
    setSearched(false);
    setSources([]);
    if (!value.trim()) return;
    try {
      let result = await searchReadwiseManualSourcesInRuntime(value);
      if (result.status === 'preparing') {
        if (request !== generation.current) return;
        setReady(false);
        await prepareReadwiseManualSearchInRuntime();
        result = await searchReadwiseManualSourcesInRuntime(value);
      }
      if (request !== generation.current) return;
      setReady(result.status === 'ready');
      setSources(result.sources);
      setSearched(result.status === 'ready');
    } catch { if (request === generation.current) setError(true); }
  }
  function changeQuery(value: string) {
    generation.current += 1;
    setQuery(value);
    setSources([]);
    setSearched(false);
  }
  async function adopt(source: NativeReadwiseManualSource) {
    setPending(source.id);
    setError(false);
    try {
      await importReadwiseManualSourceInRuntime(source.id, source.status === 'deleted');
      await search();
    } catch { setError(true); }
    finally { setPending(null); }
  }
  return { adopt, changeQuery, error, pending, query, ready, search, searched, sources };
}
