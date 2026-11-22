import { useEffect } from 'react';

import { hydrateFolderListSortMemory } from '../../shared/platform/desktop/folderListSortMemoryStore';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';

import { useSystemEntryDisplayNamesHydration } from './useSystemEntryDisplayNamesHydration';

/** Loads the library settings the desktop shows everywhere: system entry names and each list's sort choice. */
export function useLibrarySettingsHydration() {
  useSystemEntryDisplayNamesHydration();
  const { isDemo, startedAt } = useDemoRuntimeState();

  useEffect(() => {
    void hydrateFolderListSortMemory({ demo: isDemo }).catch(() => undefined);
  }, [isDemo, startedAt]);
}
