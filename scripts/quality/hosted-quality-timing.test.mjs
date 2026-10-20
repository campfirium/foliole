// @vitest-environment node

import { expect, it } from 'vitest';

import { analyzeHostedQualityTiming, renderHostedQualityTiming } from './hosted-quality-timing.mjs';

const job = (name, created, started, completed, conclusion = 'success') => ({
  name, conclusion, status: completed ? 'completed' : 'queued',
  created_at: created, started_at: started, completed_at: completed
});

it('reports queue, execution, peak, reusable nesting, and a proven top-level chain', () => {
  const report = analyzeHostedQualityTiming({
    topology: 'remote-quality',
    current: {
      run: { created_at: '2026-01-01T00:00:00Z' },
      jobs: [
        job('dev-ref', '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', '2026-01-01T00:00:03Z'),
        job('t5-baseline / Ubuntu', '2026-01-01T00:00:03Z', '2026-01-01T00:00:05Z', '2026-01-01T00:00:10Z'),
        job('full-quality / iOS', '2026-01-01T00:00:10Z', '2026-01-01T00:00:11Z', '2026-01-01T00:00:20Z')
      ]
    },
    baseline: null
  });
  expect(report.current).toMatchObject({ wallSeconds: 20, queueSeconds: 4, executionSeconds: 16, peak: 1 });
  expect(report.current.criticalChain.nodes).toEqual(['dev-ref', 't5-baseline', 'full-quality']);
  expect(report.dependencyPrecision).toContain('nested reusable-workflow edges unknown');
  expect(renderHostedQualityTiming(report)).not.toContain('undefined');
});

it('keeps failures and missing queued timestamps honest without changing conclusions', () => {
  const report = analyzeHostedQualityTiming({
    topology: 'remote-quality',
    current: {
      run: { created_at: '2026-01-01T00:00:00Z' },
      jobs: [
        job('dev-ref', '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', '2026-01-01T00:00:02Z', 'failure'),
        job('t5-baseline / queued', '2026-01-01T00:00:02Z', null, null, null)
      ]
    },
    baseline: { run: { created_at: '2025-12-31T00:00:00Z' }, jobs: [
      job('dev-ref', '2025-12-31T00:00:00Z', '2025-12-31T00:00:00Z', '2025-12-31T00:00:05Z')
    ] }
  });
  expect(report.current.incompleteJobs).toEqual(['t5-baseline / queued']);
  expect(report.wallDeltaSeconds).toBe(-3);
});

it('includes the entry gate when full quality owns the whole reusable chain', () => {
  const report = analyzeHostedQualityTiming({
    topology: 'remote-quality', baseline: null,
    current: { run: { created_at: '2026-01-01T00:00:00Z' }, jobs: [
      job('dev-ref', '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', '2026-01-01T00:00:03Z'),
      job('full-quality / t5-static / static', '2026-01-01T00:00:03Z', '2026-01-01T00:00:05Z', '2026-01-01T00:00:10Z'),
      job('full-quality / t6-ios-contract / iOS', '2026-01-01T00:00:10Z', '2026-01-01T00:00:11Z', '2026-01-01T00:00:20Z')
    ] }
  });
  expect(report.current.criticalChain).toEqual({ nodes: ['dev-ref', 'full-quality'], observedSeconds: 19 });
});

it('warns about stages much slower than the recent success without hiding small drift', () => {
  const at = (minutes) => new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString();
  const section = (electronMinutes, staticMinutes) => ({ run: { created_at: at(0) }, jobs: [
    job('full-quality / t5-electron / Electron', at(0), at(0), at(electronMinutes)),
    job('full-quality / t5-static / static', at(0), at(0), at(staticMinutes))
  ] });
  const report = analyzeHostedQualityTiming({
    topology: 'remote-quality', current: section(13, 11), baseline: section(10, 10)
  });
  expect(report.slowdowns.map((entry) => entry.name)).toEqual([
    'full-quality / t5-electron / Electron', 'workflow wall'
  ]);
  expect(report.slowdowns[0]).toMatchObject({ baselineSeconds: 600, currentSeconds: 780, ratio: 0.3 });
  const markdown = renderHostedQualityTiming(report);
  expect(markdown).toContain('Warning: slower than recent success');
  expect(markdown).toContain('full-quality / t5-electron / Electron: 10m 0s → 13m 0s (+30%)');
  expect(markdown).not.toContain('t5-static / static:');
});

it('stays quiet when there is no baseline to compare against', () => {
  const report = analyzeHostedQualityTiming({ topology: 'remote-quality', baseline: null, current: {
    run: { created_at: '2026-01-01T00:00:00Z' },
    jobs: [job('dev-ref', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z')]
  } });
  expect(report.slowdowns).toEqual([]);
  expect(renderHostedQualityTiming(report)).not.toContain('Warning');
});
