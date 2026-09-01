const HOUR_MS = 60 * 60 * 1000;
const ELECTRON_AGE_BY_RELEASE_TYPE = Object.freeze({
  major: 24 * HOUR_MS,
  minor: 4 * HOUR_MS,
  patch: 4 * HOUR_MS
});
const STABLE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const OFFICIAL_ADVISORY_SOURCES = new Set([
  'github-advisory-database',
  'npm-security-advisory'
]);

function sourceError(reason) {
  return { classification: 'source-error', reason, version: null };
}

function stableVersion(value, { githubTag = false } = {}) {
  if (typeof value !== 'string') return null;
  const normalized = githubTag && value.startsWith('v') ? value.slice(1) : value;
  return STABLE_VERSION.test(normalized) ? normalized : null;
}

function versionParts(version) {
  return stableVersion(version)?.split('.').map(Number) ?? null;
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function releaseContext(version, stableVersions, complete) {
  if (complete !== true || !Array.isArray(stableVersions)) return null;
  const normalized = [...new Set(stableVersions.map((entry) => stableVersion(entry)))];
  if (normalized.includes(null) || !normalized.includes(version)) return null;
  const previousVersion = normalized
    .filter((entry) => compareVersions(entry, version) < 0)
    .sort((left, right) => compareVersions(right, left))[0];
  if (!previousVersion) return null;
  const target = versionParts(version);
  const previous = versionParts(previousVersion);
  const releaseType = target[0] !== previous[0]
    ? 'major'
    : target[1] !== previous[1] ? 'minor' : 'patch';
  return { minimumAgeMs: ELECTRON_AGE_BY_RELEASE_TYPE[releaseType], previousVersion, releaseType };
}

function utcTimestamp(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function advisoryCoversVersion(advisory, version) {
  if (advisory == null) return false;
  return advisory.verified === true
    && OFFICIAL_ADVISORY_SOURCES.has(advisory.source)
    && typeof advisory.id === 'string'
    && advisory.id.trim().length > 0
    && advisory.packageName === 'electron'
    && Array.isArray(advisory.fixedVersions)
    && advisory.fixedVersions.includes(version);
}

export function classifyElectronVersionEligibility(input) {
  const version = stableVersion(input?.version);
  if (!version) return sourceError('electron-version-invalid');
  const context = releaseContext(version, input?.officialStableVersions, input?.stableVersionsComplete);
  if (!context) return sourceError('official-stable-context-invalid');
  const publishedAt = utcTimestamp(input?.publishedAt);
  const now = utcTimestamp(input?.now);
  if (publishedAt == null) return sourceError('npm-published-at-invalid');
  if (now == null) return sourceError('evaluation-time-invalid');

  const advisory = input?.securityAdvisory;
  if (advisory != null && !advisoryCoversVersion(advisory, version)) {
    return sourceError('security-advisory-invalid');
  }
  const evidence = { previousVersion: context.previousVersion, releaseType: context.releaseType, version };
  if (advisory) return { classification: 'eligible', reason: 'verified-security-advisory', ...evidence };

  const eligibleAt = new Date(publishedAt + context.minimumAgeMs).toISOString();
  if (now - publishedAt < context.minimumAgeMs) {
    return { classification: 'deferred', eligibleAt, reason: 'minimum-age-pending', ...evidence };
  }
  return { classification: 'eligible', eligibleAt, reason: 'minimum-age-met', ...evidence };
}

export function classifyElectronUpdateEligibility(input) {
  const github = input?.githubRelease;
  if (!github || github.isDraft !== false || github.isPrerelease !== false) {
    return sourceError('github-release-invalid');
  }
  const githubVersion = stableVersion(github.tagName, { githubTag: true });
  if (!githubVersion) return sourceError('github-version-invalid');

  const npmVersion = stableVersion(input?.npmMetadata?.latest);
  if (!npmVersion) return sourceError('npm-latest-invalid');
  if (npmVersion !== githubVersion) return sourceError('version-mismatch');

  return classifyElectronVersionEligibility({
    now: input?.now,
    officialStableVersions: input?.officialStableVersions,
    publishedAt: input?.npmMetadata?.publishedAt,
    securityAdvisory: input?.securityAdvisory,
    stableVersionsComplete: input?.stableVersionsComplete,
    version: githubVersion
  });
}

export const ELECTRON_MINIMUM_AGE_MS = ELECTRON_AGE_BY_RELEASE_TYPE;
