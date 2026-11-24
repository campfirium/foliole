import { useLayoutEffect } from 'react';

import { hydrateFolderListSortMemory } from '../../shared/platform/desktop/folderListSortMemoryStore';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useSystemEntryDisplayNamesHydration } from './useSystemEntryDisplayNamesHydration';

/** Loads the library settings the desktop shows everywhere: system entry names and each list's sort choice. */
export function useLibrarySettingsHydration() {
  useSystemEntryDisplayNamesHydration();
  const { isDemo, startedAt } = useDemoRuntimeState();

  const libraryScope = useWorkspaceStore(state => state.libraryScope);
  useLayoutEffect(() => {
    void hydrateFolderListSortMemory({ demo: isDemo, libraryScope }).catch(() => undefined);
  }, [isDemo, libraryScope, startedAt]);
}
