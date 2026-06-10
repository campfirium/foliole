import type { GlobalCapturePanelResult } from './globalCapturePanel.js';

export function installGlobalCapturePanelTestHook(showPanel: () => Promise<GlobalCapturePanelResult>) {
  const workdir = process.env.FOLIOLE_WORKDIR?.trim();
  if (process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE !== '1' || workdir === undefined || workdir === process.cwd()) return;
  Object.assign(globalThis, {
    __folioleShowGlobalCapturePanelForTests: () => {
      Object.assign(globalThis, { __folioleGlobalCapturePanelResultForTests: null });
      void showPanel().then((result) =>
        Object.assign(globalThis, { __folioleGlobalCapturePanelResultForTests: result }));
    }
  });
}
