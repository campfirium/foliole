export function summarizeSamples(samples) {
  if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Expected nonempty finite nonnegative measurements');
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return { samples, count: samples.length,
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    maximumMs: sorted.at(-1), firstMs: samples[0] };
}

export function parseBenchmarkOptions(argv) {
  const mode = argv[0] ?? 'core';
  if (!['core', 'monthly', 'quarterly'].includes(mode) || argv.length > 1) {
    throw new Error('Usage: npm run benchmark:desktop -- [core|monthly|quarterly]');
  }
  return { mode, fixtureVersion: 2, sizes: mode === 'core' ? [100, 1000] : [100, 10000],
    repeats: 3, sustainedMs: mode === 'core' ? 60_000 : 600_000, idleMs: 30_000 };
}

export function summarizeStartup(events, processes, pid) {
  const current = events.filter((event) => event.pid === pid);
  const stamp = (stage) => Date.parse(current.find((event) => event.stage === stage)?.timestamp ?? '');
  const interval = (start, end) => Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
  const boot = stamp('boot_start');
  const ready = stamp('app_ready');
  return { processToReadyMs: interval(processes.find((item) => item.pid === pid)?.creationTime, ready),
    rendererToBridgeMs: interval(boot, stamp('bridge_ready')), rendererToReadyMs: interval(boot, ready),
    moduleImportMs: interval(stamp('app_module_import_start'), stamp('app_module_import_complete')) };
}
