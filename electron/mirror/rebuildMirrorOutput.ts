export { backfillMissingMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';

import { rebuildAllMirrorOutput } from './mirrorOutputSync.js';

export function rebuildMirrorOutput() {
  return rebuildAllMirrorOutput();
}
