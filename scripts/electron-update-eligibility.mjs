const DAY_MS = 24 * 60 * 60 * 1000;
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

  const publishedAt = utcTimestamp(input?.npmMetadata?.publishedAt);
  const now = utcTimestamp(input?.now);
  if (publishedAt == null) return sourceError('npm-published-at-invalid');
  if (now == null) return sourceError('evaluation-time-invalid');

  const advisory = input?.securityAdvisory;
  if (advisory != null && !advisoryCoversVersion(advisory, githubVersion)) {
    return sourceError('security-advisory-invalid');
  }
  if (advisory) {
    return { classification: 'eligible', reason: 'verified-security-advisory', version: githubVersion };
  }

  const eligibleAt = new Date(publishedAt + DAY_MS).toISOString();
  if (now - publishedAt < DAY_MS) {
    return { classification: 'deferred', eligibleAt, reason: 'minimum-age-pending', version: githubVersion };
  }
  return { classification: 'eligible', eligibleAt, reason: 'minimum-age-met', version: githubVersion };
}

export const ELECTRON_MINIMUM_AGE_MS = DAY_MS;
