import type { BrowserWindow } from 'electron';

import { workspaceRefreshScopeHasChanges } from '../../lib/core/database/workspaceSnapshotRefresh.js';
import { refreshReadwiseApiScheduler } from '../import/readwiseApiScheduler.js';
import { runReadwiseReaderImport } from '../import/readwiseReaderImportRun.js';

import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export async function runReadwiseImportCommand(
  input: Parameters<typeof runReadwiseReaderImport>[0],
  origin: BrowserWindow | null = null
) {
  try {
    return await runReadwiseReaderImport({ ...input, onRelayCompleted: result => {
      const scope = result.workspace_scope ?? { kind: 'full' };
      if (workspaceRefreshScopeHasChanges(scope) || (result.imported_count ?? 0) > 0) {
        notifyWorkspaceContentChanged(origin, { workspaceScope: scope, requestSync: false,
          ...(result.library_scope ? { libraryScope: result.library_scope } : {}) });
      }
    } });
  } finally {
    refreshReadwiseApiScheduler();
  }
}
