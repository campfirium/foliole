import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { refreshKeepImportMonitorFromSettings } from '../import/keepImportMonitor.js';
import { refreshReadwiseApiScheduler } from '../import/readwiseApiScheduler.js';
import { previewReadwiseSourceCutover, runReadwiseSourceCutover } from '../import/readwiseSourceCutover.js';

import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export async function handleReadwiseCutoverCommand(command: string) {
  if (command === NATIVE_COMMANDS.previewReadwiseSourceCutover) return previewReadwiseSourceCutover();
  if (command !== NATIVE_COMMANDS.runReadwiseSourceCutover) return undefined;
  const result = await runReadwiseSourceCutover();
  if (result.status === 'completed') {
    await refreshKeepImportMonitorFromSettings();
    refreshReadwiseApiScheduler();
    notifyWorkspaceContentChanged();
  }
  return result;
}
