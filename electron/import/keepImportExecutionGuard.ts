import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { resolveExecutableWatchedBinding } from '../database/watchedFolderBindings.js';

export function assertKeepImportSourceCanRun(input: {
  directoryPath: string;
  ruleId: string;
  sourceType?: 'generic' | 'readwise';
}) {
  const allowed = input.sourceType === 'readwise'
    ? canCurrentHostRunReadwise()
    : resolveExecutableWatchedBinding(input.ruleId, input.directoryPath).executable;
  if (!allowed) throw new Error('source_not_owned_by_current_host');
}
