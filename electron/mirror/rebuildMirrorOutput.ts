export {
  backfillMissingMirrorOutput,
  resumePendingMirrorOutput,
  syncIncrementalMirrorOutput
} from './mirrorOutputSync.js';

import { rebuildAllMirrorOutput } from './mirrorOutputSync.js';
import { flushPermanentMirrorRetirements } from './mirrorPermanentDelete.js';

export async function rebuildMirrorOutput() {
  await flushPermanentMirrorRetirements();
  return rebuildAllMirrorOutput();
}
