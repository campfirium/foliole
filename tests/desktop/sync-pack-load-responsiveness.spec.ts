import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, test } from './harness/fixtures';
import { measureWorkloadResponsiveness } from './harness/workloadResponsiveness';

const NODE_COUNT = 3500;

async function waitForMarker(markerPath: string) {
  const deadline = Date.now() + 30_000;
  while (!existsSync(markerPath)) {
    if (Date.now() > deadline) throw new Error('sync pack workload did not start');
    await delay(10);
  }
}

test('keeps a real renderer to main IPC read responsive during sync pack apply', async ({
  desktopSession, desktopWindow
}, testInfo) => {
  test.setTimeout(90_000);
  const markerPath = testInfo.outputPath('workload-ready');
  const evidencePath = testInfo.outputPath('sync-pack-load-responsiveness.json');
  const blockMs = Number(process.env.FOLIOLE_PERF_TEST_BLOCK_MS ?? '0');
  const evidence = await measureWorkloadResponsiveness({
    startWorkload: () => desktopSession.electronApp.evaluate(async ({ app }, input) => {
      const path = process.getBuiltinModule('node:path')!;
      const module = process.getBuiltinModule('node:module')!;
      const require = module.createRequire(path.join(app.getAppPath(), 'main.js'));
      const workload = require(path.join(process.cwd(),
        'scripts/desktop/sync-pack-load-workload.cjs'));
      return workload.runSyncPackLoad(input);
    }, { markerPath, nodeCount: NODE_COUNT, blockMs }),
    waitUntilStarted: () => waitForMarker(markerPath),
    evidencePath,
    targetSha: process.env.TARGET_SHA ?? 'local',
    intervalMs: 40,
    maximumResponseMs: 750,
    minimumOverlappingSamples: 8,
    maximumWorkloadMs: 10_000,
    probe: () => desktopWindow.evaluate(() => globalThis.window!.electronAPI!.invoke(
      'load_app_settings_state', {}))
  });
  await testInfo.attach('sync-pack-load-responsiveness', {
    contentType: 'application/json', path: evidencePath
  });
  expect(evidence.workload?.result).toMatchObject({ nodeCount: NODE_COUNT });
  expect((evidence.workload?.result as { passes: number }).passes).toBeGreaterThan(0);
});
