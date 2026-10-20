// Flags timing growth against the recent successful run; it reports only and never changes a conclusion.
export const SLOWDOWN_RATIO = 0.25;
export const SLOWDOWN_MIN_SECONDS = 60;

function slowdown(name, current, baseline) {
  if (current == null || baseline == null || baseline <= 0) return null;
  const delta = current - baseline;
  if (delta < SLOWDOWN_MIN_SECONDS || delta < baseline * SLOWDOWN_RATIO) return null;
  return { name, currentSeconds: current, baselineSeconds: baseline, ratio: Math.round((delta / baseline) * 100) / 100 };
}

export function findTimingSlowdowns(current, baseline) {
  if (!baseline) return [];
  const wall = slowdown('workflow wall', current.wallSeconds, baseline.wallSeconds);
  const jobs = Object.entries(current.jobExecutionSeconds ?? {})
    .map(([name, value]) => slowdown(name, value, baseline.jobExecutionSeconds?.[name]));
  return [wall, ...jobs].filter(Boolean).sort((left, right) => right.ratio - left.ratio || left.name.localeCompare(right.name));
}

export function renderTimingSlowdowns(slowdowns, duration) {
  if (!slowdowns.length) return [];
  const limit = `${Math.round(SLOWDOWN_RATIO * 100)}% and ${SLOWDOWN_MIN_SECONDS}s`;
  return [
    `- Warning: slower than recent success by at least ${limit} (report only; conclusion unchanged):`,
    ...slowdowns.map((entry) => `  - ${entry.name}: ${duration(entry.baselineSeconds)} → `
      + `${duration(entry.currentSeconds)} (+${Math.round(entry.ratio * 100)}%)`)
  ];
}
