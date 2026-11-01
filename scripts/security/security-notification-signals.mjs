import { digest } from './security-inputs.mjs';

// Evidence timestamps are excluded: a fresh identical observation is quiet.
export function securityNotificationSignals(state) {
  const signals = {};
  for (const finding of state.findings) {
    if (!finding.active) continue;
    signals[`finding:${finding.key}`] = { kind: 'finding', advisory: finding.advisory,
      package: finding.package, platform: finding.platform, versions: finding.versions,
      severity: finding.severity, riskDigest: finding.riskDigest,
      disposition: finding.disposition?.status ?? 'unassessed' };
  }
  for (const source of state.sources) {
    if (source.status === 'clean' || source.status === 'findings') {
      if (!source.stale) continue;
    }
    signals[`source:${source.scope}`] = { kind: 'source', scope: source.scope,
      status: source.status, stale: source.stale, reason: source.reason ?? null };
  }
  for (const gap of state.gaps) signals[`gap:${gap}`] = { kind: 'missing-source', scope: gap };
  for (const health of state.health) {
    if (health.status !== 'error') continue;
    signals[`health:${health.role}`] = { kind: 'source-health', scope: health.role,
      reason: health.reason, sequence: health.sequence };
  }
  return Object.fromEntries(Object.entries(signals).sort(([a], [b]) => a.localeCompare(b)));
}

export function changedSecuritySignals(previous, current) {
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort().flatMap(key => {
    if (signalDigest(previous[key]) === signalDigest(current[key])) return [];
    return [{ key, state: current[key] ? 'actionable' : 'recovered', previous: previous[key] ?? null,
      current: current[key] ?? null }];
  });
}

function signalDigest(signal) {
  // Starting an investigation changes ownership, not the security evidence.
  const comparable = signal?.kind === 'finding' && signal.disposition === 'investigating'
    ? { ...signal, disposition: 'unassessed' } : signal;
  return digest(JSON.stringify(comparable ?? null));
}
