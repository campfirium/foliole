import { useEffect, useState } from 'react';

import type { CompanionDirectorySelection } from './CompanionDirectoryContent';

export function useCompanionDirectorySelectionState(isBrowseDirectoryOpen: boolean) {
  const [directorySelection, setDirectorySelection] = useState<CompanionDirectorySelection>({ kind: 'root' });

  useEffect(() => {
    if (!isBrowseDirectoryOpen) {
      setDirectorySelection({ kind: 'root' });
    }
  }, [isBrowseDirectoryOpen]);

  const resetDirectorySelection = (selection: CompanionDirectorySelection = { kind: 'root' }) => {
    setDirectorySelection(selection);
  };

  return { directorySelection, resetDirectorySelection, setDirectorySelection };
}
