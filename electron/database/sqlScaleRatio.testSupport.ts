import type { SqlScaleProbe } from './sqlScaleProbe.testSupport.js';

/**
 * Growth side of the scale probe: run the same operation on a library and on one `scale` times larger, then
 * flag statements or steps whose cost grew clearly faster than the library. Ratios are compared, never
 * absolute times, so a slower machine does not change the verdict.
 */
export interface ScaleGrowthFinding {
  kind: 'executions' | 'statement time' | 'step time';
  step: string;
  subject: string;
  small: number;
  large: number;
  ratio: number;
}

export interface ScaleGrowthLimits {
  scale: number;
  /** Ratio above which growth counts as superlinear; linear growth sits near `scale`. */
  maxRatio: number;
  /** Timings below this in the large run are too small to matter or to measure. */
  minLargeMs: number;
  /** Execution counts below this in the large run are ignored. */
  minLargeExecutions: number;
}

export function defaultScaleGrowthLimits(scale: number): ScaleGrowthLimits {
  return { scale, maxRatio: scale * 2, minLargeMs: 250, minLargeExecutions: 50 };
}

type ScaleProfile = Pick<SqlScaleProbe, 'records' | 'stepMs'>;

/** Keep the fastest timing of repeated runs, so a busy machine during one run does not read as growth. */
export function fastestRun(runs: ScaleProfile[]): ScaleProfile {
  const records: ScaleProfile['records'] = new Map();
  const stepMs: ScaleProfile['stepMs'] = new Map();
  for (const run of runs) {
    for (const [step, ms] of run.stepMs) stepMs.set(step, Math.min(stepMs.get(step) ?? Infinity, ms));
    for (const [step, stepRecords] of run.records) {
      const merged = records.get(step) ?? new Map();
      records.set(step, merged);
      for (const [key, record] of stepRecords) {
        const fastest = merged.get(key);
        if (!fastest || record.totalMs < fastest.totalMs) merged.set(key, record);
      }
    }
  }
  return { records, stepMs };
}

function ratio(small: number, large: number) {
  return large / Math.max(small, 1e-3);
}

export function findSuperlinearGrowth(small: ScaleProfile, large: ScaleProfile, limits: ScaleGrowthLimits) {
  const findings: ScaleGrowthFinding[] = [];
  const push = (kind: ScaleGrowthFinding['kind'], step: string, subject: string, a: number, b: number) => {
    const value = ratio(a, b);
    if (value > limits.maxRatio) findings.push({ kind, step, subject, small: a, large: b, ratio: value });
  };
  for (const [step, largeRecords] of large.records) {
    const smallRecords = small.records.get(step);
    for (const [key, record] of largeRecords) {
      const smallRecord = smallRecords?.get(key);
      const subject = `${record.caller} ${key.slice(0, 160)}`;
      if (record.count >= limits.minLargeExecutions) push('executions', step, subject, smallRecord?.count ?? 0, record.count);
      if (record.totalMs >= limits.minLargeMs) push('statement time', step, subject, smallRecord?.totalMs ?? 0, record.totalMs);
    }
  }
  for (const [step, largeMs] of large.stepMs) {
    if (largeMs >= limits.minLargeMs) push('step time', step, step, small.stepMs.get(step) ?? 0, largeMs);
  }
  return findings.sort((a, b) => b.ratio - a.ratio);
}

export function formatScaleGrowthFindings(findings: ScaleGrowthFinding[]) {
  return findings.map((finding) => `${finding.kind} x${finding.ratio.toFixed(1)} ` +
    `(${finding.small.toFixed(0)} -> ${finding.large.toFixed(0)}) in ${finding.step}: ${finding.subject}`).join('\n');
}

/** Slowest steps of a run, for locating a regression when a growth finding fires. */
export function formatStepTimes(probe: ScaleProfile, limit = 12) {
  return [...probe.stepMs].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([step, ms]) => `${step} ${ms.toFixed(0)}ms`).join('\n');
}
