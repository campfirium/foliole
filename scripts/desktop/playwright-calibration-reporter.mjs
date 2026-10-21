/* global console, process */

// Playwright time limits only stop hangs; a test slower than its calibrated time, or one
// that passed only on retry, is reported as a warning without changing the result.
export const DEFAULT_CALIBRATED_MS = 120_000;

export function calibratedMs(test, fallback = DEFAULT_CALIBRATED_MS) {
  const annotation = [...(test.annotations ?? [])].reverse().find((entry) => entry.type === 'calibrated-ms');
  return Number(annotation?.description) || fallback;
}

export function calibrationWarnings(test, result, fallback) {
  const name = test.titlePath().filter(Boolean).join(' › ');
  const limit = calibratedMs({ annotations: [...test.annotations, ...(result.annotations ?? [])] }, fallback);
  const warnings = [];
  if (result.duration > limit) {
    warnings.push(`::warning::Slower than calibrated: ${name} took ${result.duration}ms (calibrated ${limit}ms)`);
  }
  if (result.status === 'passed' && result.retry > 0) {
    warnings.push(`::warning::Passed only on retry ${result.retry}: ${name}`);
  }
  return warnings;
}

export default class CalibrationReporter {
  onTestEnd(test, result) {
    const fallback = Number(process.env.FOLIOLE_PLAYWRIGHT_CALIBRATED_MS) || DEFAULT_CALIBRATED_MS;
    for (const line of calibrationWarnings(test, result, fallback)) console.log(line);
  }
}
