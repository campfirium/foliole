import { performance } from 'node:perf_hooks';

import { summarizeSamples } from '../../../scripts/desktop/fixed-performance-summary.mjs';

import { fixedBody, navigate, resources, save, search, startup, timed } from './fixedPerformanceMeasurements';
import { expect, type DesktopSession } from './fixtures';

export async function measureRepeated(input: {
  getSession: () => DesktopSession; launch: () => Promise<DesktopSession>; size: number; repeats: number;
}) {
  const startups = [];
  const durations = { processRestart: [] as number[], search: [] as number[], cachedSearch: [] as number[],
    navigation: [] as number[], save: [] as number[] };
  for (let sample = 0; sample < input.repeats; sample++) {
    await input.getSession().close();
    const started = performance.now();
    const session = await input.launch();
    durations.processRestart.push(performance.now() - started);
    startups.push(await startup(session));
    const snapshot = await session.firstWindow.evaluate(() => window.electronAPI!.invoke('load_workspace_snapshot'));
    expect(Object.keys(snapshot!.nodesById).filter((id) => id.startsWith('benchmark-'))).toHaveLength(input.size);
    durations.search.push(await timed(() => search(session, sample)));
    durations.cachedSearch.push(await timed(() => search(session, sample)));
    durations.navigation.push(await timed(() => navigate(session, sample)));
    await session.firstWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), `benchmark-${input.size - 1}`);
    const beforeSave = sample === 0 ? fixedBody(input.size - 1) : `${fixedBody(input.size - 1)}\nSaved sample ${sample - 1}`;
    await expect.poll(() => session.firstWindow.evaluate(() =>
      window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(beforeSave);
    durations.save.push(await timed(() => save(session, input.size - 1, sample)));
  }
  return { startups, timings: Object.fromEntries(Object.entries(durations)
    .map(([key, values]) => [key, summarizeSamples(values)])) };
}

export async function measureSustained(session: DesktopSession, size: number,
  options: { sustainedMs: number; idleMs: number }) {
  const before = await resources(session);
  const started = performance.now();
  const navigation = [];
  const snapshots = [];
  let step = 0;
  while (performance.now() - started < options.sustainedMs) {
    navigation.push(await timed(() => navigate(session, step++ % (size - 1))));
    if (step % 100 === 0) snapshots.push(await resources(session));
  }
  const durationMs = performance.now() - started;
  const after = await resources(session);
  await session.firstWindow.waitForTimeout(options.idleMs);
  const idle = await resources(session);
  return { before, durationMs, navigation: summarizeSamples(navigation), snapshots, after, idle };
}

export function measureSync(session: DesktopSession, size: number, repeats: number) {
  return session.electronApp.evaluate(async (_, input) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    return require(`${process.cwd()}/scripts/desktop/fixed-performance-sync.cjs`).runFixedSyncBenchmark(input);
  }, { nodeCount: size, repeats });
}
