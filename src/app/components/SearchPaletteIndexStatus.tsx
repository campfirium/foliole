import { useEffect, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  loadSearchIndexRebuildStatus,
  onSearchIndexRebuildStatus,
  type SearchIndexRebuildStatus
} from '../../shared/platform/searchIndexRebuildStatus';

export function SearchPaletteIndexStatus({ isOpen }: { isOpen: boolean }) {
  const t = useTranslation();
  const [status, setStatus] = useState<SearchIndexRebuildStatus | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStatus(null);
      return undefined;
    }
    let cancelled = false;
    void loadSearchIndexRebuildStatus()
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    const unsubscribe = onSearchIndexRebuildStatus((nextStatus) => {
      if (!cancelled) setStatus(nextStatus);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isOpen]);

  if (status?.status === 'rebuilding') {
    return (
      <p className="border-b border-border/60 px-5 py-2 text-xs text-foreground/60" role="status">
        {t('desktop.search.indexStatus.updating')}
      </p>
    );
  }
  if (status?.status === 'failed') {
    return (
      <p className="border-b border-border/60 px-5 py-2 text-xs text-error" role="status">
        {t('desktop.search.indexStatus.failed')}
      </p>
    );
  }
  return null;
}
