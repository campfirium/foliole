import { useEffect } from 'react';

import type { CompanionDirectorySelection } from './CompanionDirectoryContent';
import { useCompanionNavigationField } from './CompanionNavigationProvider';

export function useCompanionDirectorySelectionState(isBrowseDirectoryOpen: boolean) {
  const [directorySelection, setDirectorySelection] = useCompanionNavigationField('directorySelection', { kind: 'root' });

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
