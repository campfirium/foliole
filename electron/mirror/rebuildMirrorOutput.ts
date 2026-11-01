export {
  backfillMissingMirrorOutput,
  resumePendingMirrorOutput,
  syncIncrementalMirrorOutput
} from './mirrorOutputSync.js';

import type { NativeMirrorOutputRebuildResult } from '../../lib/platform/nativeUtilityContract.js';
import { DESKTOP_OPERATION_DEFINITIONS } from '../desktopOperationDefinitions.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

import { rebuildAllMirrorOutput } from './mirrorOutputSync.js';
import { flushPermanentMirrorRetirements } from './mirrorPermanentDelete.js';

export async function rebuildMirrorOutput() {
  const definition = DESKTOP_OPERATION_DEFINITIONS['mirror-incremental'];
  const task = desktopTaskScheduler.submit({
    // Keep incremental callbacks distinct; the shared CPU claim serializes mirror work.
    concurrencyKey: 'mirror-rebuild',
    duplicatePolicy: 'enqueue',
    id: 'mirror-rebuild',
    label: 'Mirror output rebuild',
    priority: definition.priority,
    resources: definition.resources,
    runOn: definition.runOn,
    source: 'mirror-rebuild',
    run: async () => {
      await flushPermanentMirrorRetirements();
      return rebuildAllMirrorOutput();
    }
  });
  return await task.promise as NativeMirrorOutputRebuildResult;
}
