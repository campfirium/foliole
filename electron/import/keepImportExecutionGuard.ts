import { canCurrentDeviceRunReadwise } from '../database/readwiseDeviceAssignment.js';
import { resolveExecutableWatchedBinding } from '../database/watchedFolderBindings.js';

export function assertKeepImportSourceCanRun(input: {
  directoryPath: string;
  ruleId: string;
  sourceType?: 'generic' | 'readwise';
}) {
  const allowed = input.sourceType === 'readwise'
    ? canCurrentDeviceRunReadwise()
    : resolveExecutableWatchedBinding(input.ruleId, input.directoryPath).executable;
  if (!allowed) throw new Error('source_not_connected_to_this_device');
}
