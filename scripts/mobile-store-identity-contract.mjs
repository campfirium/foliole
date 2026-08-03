/* global structuredClone */

const PRODUCT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const PLATFORMS = new Set(['android', 'ios']);
const BUILD_OUTCOMES = new Set(['uploaded', 'rejected', 'approved', 'available']);

function requireProductVersion(value, label) {
  if (typeof value !== 'string' || !PRODUCT_VERSION.test(value)) {
    throw new Error(`${label} must be a stable product version.`);
  }
  return value;
}

function requirePlatform(value) {
  if (!PLATFORMS.has(value)) throw new Error('mobile platform must be android or ios.');
  return value;
}

function requireBuildNumber(value, label = 'internal build number') {
  const normalized = typeof value === 'number' ? String(value) : value;
  if (typeof normalized !== 'string' || !/^[1-9]\d*$/u.test(normalized)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized;
}

export function resolveMobileBuildIdentity(candidate, packageVersion) {
  const platform = requirePlatform(candidate?.platform);
  const productVersion = requireProductVersion(candidate?.productVersion, 'mobile product version');
  if (productVersion !== packageVersion) {
    throw new Error('mobile product version must match package.json version.');
  }
  return {
    internalBuildNumber: requireBuildNumber(candidate?.internalBuildNumber),
    platform,
    productVersion,
    userVisibleVersion: productVersion
  };
}

function validateHistory(history) {
  if (history?.schemaVersion !== 1 || !Array.isArray(history.attempts)) {
    throw new Error('mobile build history must use schemaVersion 1 with attempts.');
  }
  return history.attempts.map((attempt, index) => {
    const outcome = attempt?.outcome;
    if (!BUILD_OUTCOMES.has(outcome)) throw new Error(`attempts[${index}].outcome is invalid.`);
    return {
      ...resolveMobileBuildIdentity(attempt, attempt.productVersion),
      outcome
    };
  });
}

export function recordMobileBuildAttempt(history, identity, outcome) {
  const attempts = validateHistory(history);
  const candidate = resolveMobileBuildIdentity(identity, identity?.productVersion);
  if (!BUILD_OUTCOMES.has(outcome)) throw new Error('mobile build outcome is invalid.');
  const platformAttempts = attempts.filter((attempt) => attempt.platform === candidate.platform);
  const buildNumber = Number.parseInt(candidate.internalBuildNumber, 10);
  const latest = Math.max(0, ...platformAttempts.map((attempt) => Number.parseInt(attempt.internalBuildNumber, 10)));
  if (buildNumber <= latest) {
    throw new Error(`${candidate.platform} internal build number must increase after every submitted attempt.`);
  }
  return {
    schemaVersion: 1,
    attempts: [...history.attempts, { ...candidate, outcome }]
  };
}

export function applyMobileStoreAvailability(directory, identity, storeStatus) {
  const candidate = resolveMobileBuildIdentity(identity, identity?.productVersion);
  if (!['in-review', 'rejected', 'approved', 'available'].includes(storeStatus)) {
    throw new Error('mobile store status is invalid.');
  }
  if (storeStatus !== 'available') return structuredClone(directory);
  return {
    ...structuredClone(directory),
    platforms: {
      ...structuredClone(directory.platforms ?? {}),
      [candidate.platform]: {
        channel: candidate.platform === 'android' ? 'google-play' : 'app-store',
        status: 'available',
        version: candidate.productVersion
      }
    }
  };
}

function uniqueMatches(source, pattern, label) {
  const matches = [...source.matchAll(pattern)].map((match) => match[1]);
  if (matches.length === 0) throw new Error(`${label} is missing.`);
  return [...new Set(matches)];
}

export function validateMobilePlatformVersions({ androidGradle, iosInfoPlist, iosProject, packageVersion }) {
  requireProductVersion(packageVersion, 'package.json version');
  const androidVersions = uniqueMatches(androidGradle, /versionName\s+["']([^"']+)["']/gu, 'Android versionName');
  const androidBuilds = uniqueMatches(androidGradle, /versionCode\s+(\d+)/gu, 'Android versionCode');
  const iosVersions = uniqueMatches(iosProject, /MARKETING_VERSION\s*=\s*([^;]+);/gu, 'iOS MARKETING_VERSION');
  const iosBuilds = uniqueMatches(iosProject, /CURRENT_PROJECT_VERSION\s*=\s*([^;]+);/gu, 'iOS CURRENT_PROJECT_VERSION');
  if (androidVersions.length !== 1 || androidVersions[0] !== packageVersion) {
    throw new Error('Android versionName must match package.json version in every configuration.');
  }
  if (iosVersions.length !== 1 || iosVersions[0] !== packageVersion) {
    throw new Error('iOS MARKETING_VERSION must match package.json version in every configuration.');
  }
  androidBuilds.forEach((value) => requireBuildNumber(value, 'Android versionCode'));
  iosBuilds.forEach((value) => requireBuildNumber(value, 'iOS CURRENT_PROJECT_VERSION'));
  if (!iosInfoPlist.includes('<string>$(MARKETING_VERSION)</string>') ||
      !iosInfoPlist.includes('<string>$(CURRENT_PROJECT_VERSION)</string>')) {
    throw new Error('iOS Info.plist must expose marketing and internal build settings separately.');
  }
  return {
    android: { internalBuildNumber: androidBuilds[0], userVisibleVersion: androidVersions[0] },
    ios: { internalBuildNumber: iosBuilds[0], userVisibleVersion: iosVersions[0] }
  };
}
