import { loadImportManagerSettings } from './import/importManagerSettings.js';
import { loadLibraryPathSettingsSync } from './ipc/libraryPaths.js';
import type { SafetyPathCandidate } from './libraryPathSafety.js';

export function loadManagedPathCandidates(options: { includeReadwise?: boolean } = {}): SafetyPathCandidate[] {
  const libraryPaths = loadLibraryPathSettingsSync();
  return [
    { label: 'Assets', path: libraryPaths.assets_dir },
    { label: 'Data', path: libraryPaths.data_dir },
    { label: 'Inbox', path: libraryPaths.inbox },
    { label: 'Mirror', path: libraryPaths.mirror },
    ...(options.includeReadwise === false
      ? []
      : [{ label: 'Readwise Reader folder', path: loadImportManagerSettings().readwiseRootPath }])
  ];
}
