import { mkdir, writeFile } from 'node:fs/promises';

import { test, expect } from '@playwright/test';

import { parseBenchmarkOptions } from '../../scripts/desktop/fixed-performance-summary.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { fixedBody, seed, startup } from './harness/fixedPerformanceMeasurements';
import { measureRepeated, measureSustained, measureSync } from './harness/fixedPerformanceScenarios';
import type { DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const options = parseBenchmarkOptions([process.env.FOLIOLE_BENCHMARK_MODE ?? 'core']);

for (const size of options.sizes) {
  test(`fixed performance scenarios at ${size} articles`, async ({ browserName }, testInfo) => {
    test.setTimeout(options.sustainedMs + 900_000);
    void browserName;
    const root = testInfo.outputPath('state');
    await mkdir(root, { recursive: true });
    const evidence: Record<string, unknown> = { size, options, scope: 'hidden native; production renderer',
      conditions: 'OS caches retained; no forced GC; fixed approximately 4 KiB bodies', completed: false };
    let session: DesktopSession | undefined;
    const launch = async () => {
      session = await launchDesktopSession({ env: { ...process.env,
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: root } }) as DesktopSession;
      await expectWorkspaceShell(session.firstWindow);
      return session;
    };
    try {
      await launch();
      evidence.emptyStartup = await startup(session!);
      await seed(session!, size);
      evidence.repeated = await measureRepeated({ getSession: () => session!, launch,
        size, repeats: options.repeats });
      evidence.sustained = await measureSustained(session!, size, options);
      evidence.sync = await measureSync(session!, size, options.repeats);
      await session!.close();
      await launch();
      const saved = await session!.firstWindow.evaluate(async (id) =>
        (await window.electronAPI!.invoke('load_node_document', { nodeId: id }))?.content, `benchmark-${size - 1}`);
      expect(saved).toBe(`${fixedBody(size - 1)}\nSaved sample ${options.repeats - 1}`);
      evidence.completed = true;
    } catch (error) {
      evidence.failure = String(error);
      if (session) evidence.diagnostics = await session.collectDiagnostics().catch(String);
      throw error;
    } finally {
      await writeFile(testInfo.outputPath('benchmark.json'), JSON.stringify(evidence, null, 2));
      await testInfo.attach('fixed-performance-benchmark', { path: testInfo.outputPath('benchmark.json'),
        contentType: 'application/json' });
      await session?.close();
    }
  });
}
