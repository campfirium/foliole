import { digest } from './security-inputs.mjs';

const fixedBoundaries = new Set([
  'foliole/swift-native', 'foliole/embedded-native', 'foliole/apple-tools', 'foliole/apple-os-webkit'
]);

function statusOnlyFinding(key, signal) {
  if (signal.kind !== 'finding' || signal.severity !== 'info') return false;
  const identity = digest(`official-review|${signal.platform}|${signal.package}|${signal.advisory}`);
  // Old notifications omit the provider; verify the complete persisted identity.
  if (key !== `finding:${identity}`) return false;
  if (signal.platform === 'ios' && signal.advisory === 'coverage-review-required') {
    return fixedBoundaries.has(signal.package);
  }
  if (signal.platform !== 'android') return false;
  if (signal.package === 'android-sdk') {
    return /^release-review-(?:build-tools|platform-tools|cmdline-tools)-/u.test(signal.advisory);
  }
  // These producers compare versions only. SQLCipher vendor releases, JDK trust
  // changes and unknown identities remain actionable, including info findings.
  return ['sqlite', 'libtomcrypt'].includes(signal.package)
    && /^release-review-/u.test(signal.advisory);
}

export function normalizeSecurityNotificationSignals(signals) {
  const result = {};
  for (const [key, signal] of Object.entries(signals)) {
    if (statusOnlyFinding(key, signal)) continue;
    if (signal.kind === 'missing-source' && key === `gap:${signal.scope}`) {
      const sourceKey = `source:${signal.scope}`;
      result[sourceKey] ??= { kind: 'source', scope: signal.scope, status: 'missing',
        stale: false, reason: 'required-observation-missing' };
    } else result[key] = signal;
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
