import { useLayoutEffect, useRef, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  canHandoffCompanionArticle,
  handoffCompanionArticle
} from '../shared/platform/companion/reading/companionArticleHandoff';

import type { CompanionReadingActivity } from './companionReadingActivity';

export function useCompanionArticleHandoff(
  nodeId: string | undefined,
  activity: CompanionReadingActivity | undefined,
  close: () => void
) {
  const t = useTranslation();
  const current = useRef<object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  useLayoutEffect(() => {
    current.current = {};
    setError(null);
    return () => { current.current = null; };
  }, [nodeId]);
  if (!nodeId || !canHandoffCompanionArticle()) return undefined;

  async function run() {
    if (pending.current) return;
    pending.current = true;
    setError(null);
    const request = current.current;
    const isCurrent = () => request !== null && current.current === request;
    try {
      if (!nodeId) return;
      const result = await handoffCompanionArticle({
        nodeId, isCurrent, flush: async () => { await activity?.flush(undefined, { position: false }); }
      });
      if (!isCurrent()) return;
      if (result.status === 'unavailable') setError(t('companion.reading.articleHandoffUnavailable'));
      if (result.status === 'presented') close();
    } catch {
      if (isCurrent()) setError(t('companion.reading.articleHandoffFailed'));
    } finally {
      pending.current = false;
    }
  }
  return { run, error };
}
