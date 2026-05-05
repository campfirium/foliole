import { useEffect, useState } from 'react';

import { loadRuntimeExternalSearchFolders } from '../../shared/platform/externalSearchRuntimeRepository';
import { resolveExternalSectionStatusLabel } from '../../shared/platform/externalSearchStatus';

export function useExternalSectionStatus(isOpen: boolean) {
  const [statusLabel, setStatusLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStatusLabel(null);
      return;
    }

    let cancelled = false;
    loadRuntimeExternalSearchFolders()
      .then((folders) => {
        if (cancelled || folders === null) {
          return;
        }
        setStatusLabel(resolveExternalSectionStatusLabel(folders));
      })
      .catch(() => {
        if (!cancelled) {
          setStatusLabel('Folder unavailable');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  return statusLabel;
}
