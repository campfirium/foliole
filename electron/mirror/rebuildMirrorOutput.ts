import type { NativeMirrorOutputRebuildResult } from '../../lib/platform/nativeUtilityContract.js';

export async function rebuildMirrorOutput(): Promise<NativeMirrorOutputRebuildResult> {
  throw new Error(
    'Mirror article rebuild is still being wired. Daily incremental mirror output remains the main path, and startup checks only backfill missing articles.'
  );
}
