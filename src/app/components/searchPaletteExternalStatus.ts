import { useEffect, useState } from 'react';

import { loadExternalLibraryFolders } from '../../shared/platform/externalLibraryBrowseRepository';
import { resolveExternalSectionStatusLabel } from '../../shared/platform/externalSearchStatus';

export function useExternalSectionStatus(isOpen: boolean) {
  const [statusLabel, setStatusLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStatusLabel(null);
      return;
    }

    let cancelled = false;
    loadExternalLibraryFolders()
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
