import { digest } from './security-inputs.mjs';

function applyObservation(observation, state) {
  for (const check of observation.checks) {
    const scope = `${observation.role}:${check.key}`;
    state.required.add(scope);
    if (!check.attempted) continue;
    const complete = ['clean', 'findings'].includes(check.status);
    if (complete) for (const finding of state.facts.values()) finding.sources.delete(scope);
    for (const finding of check.findings) {
      const item = state.facts.get(finding.key) ?? { key: finding.key, package: finding.package,
        advisory: finding.advisory, provider: finding.provider, platform: finding.platform, sources: new Map() };
      const previous = item.sources.get(scope);
      const versions = [...new Set([...(complete ? [] : previous?.versions ?? []), ...finding.versions])].sort();
      const evidence = complete ? {} : { ...previous?.evidence };
      for (const version of finding.versions) evidence[version] = { checkedAt: observation.checkedAt, observation: observation.id };
      item.sources.set(scope, { versions, evidence, lastAttemptAt: observation.checkedAt,
        observation: observation.id, versionDigest: digest(JSON.stringify(versions)) });
      item.severity = finding.severity;
      item.affectedRange = finding.affectedRange;
      item.lastObservedVersions = [...new Set([...item.sources.values()].flatMap(value => value.versions))].sort();
      state.facts.set(finding.key, item);
    }
    state.sources.set(scope, { ...check, scope, checkedAt: observation.checkedAt, observation: observation.id,
      stale: state.now - Date.parse(observation.checkedAt) > check.ttlHours * 3_600_000 });
  }
}

function projectFindings(facts, dispositions, now) {
  return [...facts.values()].map(finding => {
    const versions = finding.sources.size ? [...new Set([...finding.sources.values()].flatMap(value => value.versions))].sort()
      : finding.lastObservedVersions;
    const versionDigest = digest(JSON.stringify(versions));
    const riskDigest = digest(JSON.stringify({ versions, severity: finding.severity, range: finding.affectedRange }));
    const disposition = dispositions.filter(value => value.finding === finding.key).at(-1);
    const valid = disposition?.versionDigest === versionDigest && disposition?.riskDigest === riskDigest
      && Date.parse(disposition.expiresAt) > now && !(disposition.status === 'fixed' && finding.sources.size);
    return { ...finding, sources: [...finding.sources.entries()].map(([scope, value]) => ({ scope, ...value })),
      active: finding.sources.size > 0, versions, versionDigest, riskDigest,
      disposition: valid ? disposition : disposition ? { ...disposition, status: 'expired-or-evidence-changed' } : null };
  });
}

export function projectOwnerObservations(observations, dispositions, health, now) {
  const state = { sources: new Map(), facts: new Map(), required: new Set(), now };
  observations.sort((a, b) => a.checkedAt.localeCompare(b.checkedAt) || a.id.localeCompare(b.id));
  dispositions.sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
  for (const observation of observations) applyObservation(observation, state);
  const findings = projectFindings(state.facts, dispositions, now);
  const sources = [...state.sources.values()];
  const gaps = [...state.required].filter(scope => !state.sources.has(scope));
  return { schemaVersion: 1, observations: observations.length, findings, gaps, health, sources,
    overallStatus: 'incomplete', qualification: 'use-current-candidate-coverage-aggregate',
    observedStatus: sources.every(source => source.status === 'clean' && !source.stale)
      && findings.every(finding => !finding.active) && health.every(value => value.status === 'clean')
      && !gaps.length && observations.length ? 'clean' : 'incomplete' };
}
