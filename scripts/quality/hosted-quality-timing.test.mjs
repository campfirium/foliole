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
