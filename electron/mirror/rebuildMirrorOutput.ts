export {
  backfillMissingMirrorOutput,
  resumePendingMirrorOutput,
  syncIncrementalMirrorOutput
} from './mirrorOutputSync.js';

import { rebuildAllMirrorOutput } from './mirrorOutputSync.js';

export function rebuildMirrorOutput() {
  return rebuildAllMirrorOutput();
}
