const official = (id, scope, source, versionSources) => ({ id, scope, owner: 'security-maintenance',
  versionSources, routes: [{ id: 'official-review', ttlHours: 192, source }] });

export const SECURITY_COVERAGE = [
  { id: 'npm-runtime', scope: 'Production npm dependencies', owner: 'security-maintenance',
    versionSources: ['package-lock.json'], routes: [{ id: 'npm-audit', ttlHours: 26 }] },
  { id: 'npm-build', scope: 'Full npm lock including development/build tools', owner: 'security-maintenance',
    versionSources: ['package-lock.json'], routes: [{ id: 'npm-audit', ttlHours: 26 }] },
  { id: 'android-maven', scope: 'Resolved runtime, buildscript and protobuf tools', owner: 'security-maintenance',
    versionSources: ['Android resolved inventory'], routes: [{ id: 'osv-maven', ttlHours: 26 }] },
  official('swift-native', 'Both Swift graphs, local plugin edges and remote packages',
    'https://github.com/ionic-team/capacitor/security/advisories', ['App and host Swift graphs/locks']),
  official('embedded-native', 'SQLCipher core, embedded SQLite and cryptographic providers',
    'https://www.zetetic.net/blog/', ['Actual AAR/XCFramework and packaged binary components']),
  official('gradle', 'Gradle distribution and Wrapper integrity',
    'https://github.com/gradle/gradle/security/advisories', ['gradle-wrapper.properties', 'Verified distribution/JAR']),
  official('jdk', 'Each build environment JDK distributor and trust store',
    'https://ops.java/emudhra/', ['Build-selected Java runtime and actual trust-store check']),
  official('node-npm', 'Host Node/npm and bundled Electron Node',
    'https://nodejs.org/en/blog/vulnerability', ['Actual tools', 'Electron bundled runtime']),
  official('electron-capacitor', 'Electron/Chromium and Capacitor host runtimes',
    'https://releases.electronjs.org/', ['npm lock', 'Actual Electron binary', 'Swift resolved graph']),
  official('apple-tools', 'Xcode, Swift and Apple SDKs',
    'https://developer.apple.com/news/releases/', ['Actual Xcode and Swift resolution environment']),
  official('android-tools', 'Selected Android SDK/Build Tools and build-time tools',
    'https://developer.android.com/tools/releases/build-tools', ['Actual resolved Android SDK/Build Tools']),
  official('github-actions', 'Every workflow action and reusable workflow reference',
    'https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions',
    ['Parsed .github/workflows YAML uses references']),
  official('android-os-webview', 'Device Android patch level and WebView provider',
    'https://source.android.com/docs/security/bulletin', ['Fixed-device batch observations']),
  official('apple-os-webkit', 'Device iOS/macOS and system WebKit',
    'https://support.apple.com/en-us/100100', ['Actual host/device batch observations'])
];

export function assessObservation(observation, { candidate, environment, now, ttlHours }) {
  if (!observation) return { status: 'error', reason: 'required-observation-missing' };
  if (!['clean', 'findings', 'error', 'unsupported'].includes(observation.status)) {
    return { status: 'error', reason: 'invalid-observation-status' };
  }
  if (observation.candidate?.revision !== candidate.revision
    || observation.candidate?.inputDigest !== candidate.inputDigest) {
    return { status: 'error', reason: 'candidate-input-mismatch', observed: observation };
  }
  if (!environment || observation.environment !== environment) {
    return { status: 'error', reason: 'environment-unverified-or-mismatched', observed: observation };
  }
  const age = now - Date.parse(observation.checkedAt);
  if (!Number.isFinite(age) || age < -300_000 || age > ttlHours * 3_600_000) {
    return { status: 'error', reason: 'observation-expired-or-invalid-time', observed: observation };
  }
  if (!observation.source) return { status: 'error', reason: 'observation-source-missing' };
  return observation;
}

export function createCoverageReport({ snapshot, observations, now = Date.now(), assets = SECURITY_COVERAGE }) {
  const coverage = assets.map(asset => ({ ...asset, checks: asset.routes.map(route => ({
    route: route.id, ...assessObservation(observations.find(row => row.asset === asset.id && row.route === route.id),
      { candidate: snapshot.candidate, environment: snapshot.environments[asset.id], now, ttlHours: route.ttlHours })
  })) }));
  const checks = coverage.flatMap(asset => asset.checks);
  return { schemaVersion: 1, generatedAt: new Date(now).toISOString(), snapshot, coverage,
    overallStatus: checks.every(check => check.status === 'clean') && snapshot.mode === 'committed'
      ? 'clean' : 'incomplete',
    findings: coverage.filter(asset => asset.checks.some(check => check.status === 'findings'
      || check.findings?.length || check.observed?.status === 'findings' || check.observed?.findings?.length)),
    gaps: coverage.filter(asset => asset.checks.some(check => check.status !== 'clean')),
    limitations: ['Coverage is declared source evidence, not proof that vulnerabilities cannot exist.',
      ...(snapshot.mode === 'committed' ? [] : ['Working-tree observations do not attest a frozen release candidate.'])] };
}
