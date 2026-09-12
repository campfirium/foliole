import type { GlobalClipToInboxDeps } from './globalClipToInbox.js';

declare global {
  var __folioleRunGlobalClipToInboxForTests:
    | ((deps?: GlobalClipToInboxDeps) => Promise<unknown>)
    | undefined;
}

function isIsolatedDesktopTestRuntime() {
  return process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE === '1'
    && Boolean(process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT?.trim());
}

export function installGlobalClipToInboxTestHook(
  run: (deps?: GlobalClipToInboxDeps) => Promise<unknown>
) {
  if (!isIsolatedDesktopTestRuntime()) return;
  globalThis.__folioleRunGlobalClipToInboxForTests = run;
}
