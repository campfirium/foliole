import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { summarizeSamples } from './fixed-performance-summary.mjs';

async function findReports(root) {
  const reports = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory() && entry.name !== 'state') reports.push(...await findReports(file));
    else if (entry.name === 'benchmark.json' || /^http-\d+\.json$/.test(entry.name)) {
      reports.push({ path: file, data: JSON.parse(await readFile(file, 'utf8')) });
    }
  }
  return reports;
}

export async function createBenchmarkReport(output) {
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  const reports = await findReports(output);
  const scenarios = reports.map(({ path: evidencePath, data }) => {
    if (data.boundary) {
      const measurements = ['first', 'unchanged'].map((mode) => [mode,
        data.samples.every((sample) => sample[mode]) && data.samples.length
          ? summarizeSamples(data.samples.map((sample) => sample[mode].durationMs)) : null]);
      return { size: data.size, kind: 'http', completed: data.completed, failure: data.failure,
        timings: Object.fromEntries(measurements), evidencePath };
    }
    const metrics = [data.sustained?.before, ...data.sustained?.snapshots ?? [],
      data.sustained?.after, data.sustained?.idle].filter(Boolean);
    const heaps = metrics.map((sample) => sample.renderer.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value)
      .filter((value) => Number.isFinite(value));
    return { size: data.size, kind: 'desktop', completed: data.completed, failure: data.failure,
      timings: data.repeated?.timings, sustainedNavigation: data.sustained?.navigation,
      sampledPeakHeapBytes: heaps.length ? Math.max(...heaps) : null, evidencePath };
  });
  return { manifest, scenarios, verdict: manifest.exitCode === 0 && scenarios.length === 4
    && scenarios.every((item) => item.completed) ? 'measured; no performance qualification threshold' : 'incomplete or failed' };
}

export function compareBenchmarkReports(previous, current) {
  const reasons = [];
  for (const key of ['platform', 'arch', 'model', 'cpus', 'totalMemory', 'node']) {
    if (previous.manifest.machine[key] !== current.manifest.machine[key]) reasons.push(`machine.${key} differs`);
  }
  if (JSON.stringify(previous.manifest.options) !== JSON.stringify(current.manifest.options)) reasons.push('sample conditions differ');
  if ([previous, current].some((report) => report.scenarios.length !== 4
    || report.scenarios.some((item) => !item.completed) || report.manifest.exitCode !== 0)) reasons.push('missing or failed scenarios');
  if (reasons.length) return { comparable: false, reasons, ratios: [] };
  const ratios = [];
  for (const next of current.scenarios) {
    const before = previous.scenarios.find((item) => item.kind === next.kind && item.size === next.size);
    if (!before) return { comparable: false, reasons: ['scenario sizes differ'], ratios: [] };
    for (const [name, measurement] of Object.entries(next.timings)) {
      const old = before.timings[name];
      ratios.push({ kind: next.kind, size: next.size, name,
        previousMedianMs: old.medianMs, currentMedianMs: measurement.medianMs,
        medianRatio: old.medianMs === 0 ? null : measurement.medianMs / old.medianMs,
        previousMaximumMs: old.maximumMs, currentMaximumMs: measurement.maximumMs });
    }
  }
  return { comparable: true, reasons: [], ratios,
    verdict: 'observations only; inspect variance and absolute impact before qualifying a regression' };
}
