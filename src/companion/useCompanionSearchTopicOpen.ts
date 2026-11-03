import { useEffect, useRef, useState } from 'react';

import { isCompanionSearchTopicAvailable, type CompanionTopicSearchResult } from '../shared/platform/companionFullTextSearch';

import { useCompanionPageActive } from './CompanionPageStack';

export function useCompanionSearchTopicOpen(query: string,
  onOpen: ((result: CompanionTopicSearchResult, query: string) => void) | undefined) {
  const active = useCompanionPageActive();
  const [failed, setFailed] = useState(false);
  const opening = useRef(0);
  useEffect(() => {
    opening.current += 1;
    setFailed(false);
    return () => { opening.current += 1; };
  }, [query, active]);
  return {
    failed,
    cancel: () => { opening.current += 1; setFailed(false); },
    async open(result: CompanionTopicSearchResult) {
      if (!active) return;
      const request = ++opening.current;
      const available = await isCompanionSearchTopicAvailable(result.nodeId).catch(() => false);
      if (request !== opening.current) return;
      setFailed(!available);
      if (available) onOpen?.(result, query.trim());
    }
  };
}
