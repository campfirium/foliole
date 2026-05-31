const WINDOWS_PLATFORM_ID = 'windows';
const CHECK_INTERVAL_MINUTES = 60;
const STABLE_CHECK_INTERVAL_MINUTES = 24 * 60;
const FAILURE_RETRY_MINUTES = 15;
const MIN_INTERVAL_MINUTES = 30;
const MAX_INTERVAL_MINUTES = 24 * 60;
const MIN_FAILURE_RETRY_MINUTES = 5;
const MAX_FAILURE_RETRY_MINUTES = 24 * 60;

type CheckStatus = 'available' | 'current' | 'failed' | 'idle';

interface UpdateCheckPolicy {
  failureRetryMinutes?: number;
  intervalMinutes?: number;
}

export interface UpdateRelease {
  date?: string;
  platforms: string[];
  severity?: 'critical' | 'normal' | 'security';
  summary?: string;
  url: string;
  version: string;
}

export interface UpdateManifest {
  channel?: string;
  checkPolicy?: UpdateCheckPolicy;
  latest?: string;
  releases: UpdateRelease[];
  schemaVersion: number;
}

export interface UpdateCheckState {
  cachedManifest: UpdateManifest | null;
  dismissedVersion: string | null;
  lastCheckedAt: string | null;
  lastCheckStatus: CheckStatus;
  lastSeenVersion: string | null;
  latestReleaseUrl: string | null;
  latestVersion: string | null;
}

export const DEFAULT_UPDATE_STATE: UpdateCheckState = {
  cachedManifest: null,
  dismissedVersion: null,
  lastCheckedAt: null,
  lastCheckStatus: 'idle',
  lastSeenVersion: null,
  latestReleaseUrl: null,
  latestVersion: null
};

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampMinutes(value: number | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizePolicy(policy: Record<string, unknown>): UpdateCheckPolicy {
  const failureRetryMinutes = readNumber(policy.failureRetryMinutes);
  const intervalMinutes = readNumber(policy.intervalMinutes);
  return {
    ...(failureRetryMinutes === null ? {} : { failureRetryMinutes }),
    ...(intervalMinutes === null ? {} : { intervalMinutes })
  };
}

function normalizeRelease(value: unknown): UpdateRelease | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.version !== 'string' || typeof raw.url !== 'string' || !Array.isArray(raw.platforms)) return null;
  const platforms = raw.platforms.filter((platform): platform is string => typeof platform === 'string');
  if (!platforms.length) return null;
  return {
    ...(typeof raw.date === 'string' ? { date: raw.date } : {}),
    platforms,
    ...(raw.severity === 'critical' || raw.severity === 'normal' || raw.severity === 'security' ? { severity: raw.severity } : {}),
    ...(typeof raw.summary === 'string' ? { summary: raw.summary } : {}),
    url: raw.url,
    version: raw.version
  };
}

export function normalizeUpdateManifest(value: unknown): UpdateManifest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const releases = Array.isArray(raw.releases) ? raw.releases.map(normalizeRelease).filter((item): item is UpdateRelease => Boolean(item)) : [];
  if (raw.schemaVersion !== 1 || !releases.length) return null;
  const policy = raw.checkPolicy && typeof raw.checkPolicy === 'object' ? raw.checkPolicy as Record<string, unknown> : null;
  return {
    ...(typeof raw.channel === 'string' ? { channel: raw.channel } : {}),
    ...(policy ? { checkPolicy: normalizePolicy(policy) } : {}),
    ...(typeof raw.latest === 'string' ? { latest: raw.latest } : {}),
    releases,
    schemaVersion: 1
  };
}

export function normalizeUpdateState(value: unknown): UpdateCheckState {
  if (!value || typeof value !== 'object') return DEFAULT_UPDATE_STATE;
  const raw = value as Record<string, unknown>;
  return {
    cachedManifest: normalizeUpdateManifest(raw.cachedManifest),
    dismissedVersion: typeof raw.dismissedVersion === 'string' ? raw.dismissedVersion : null,
    lastCheckedAt: typeof raw.lastCheckedAt === 'string' ? raw.lastCheckedAt : null,
    lastCheckStatus:
      raw.lastCheckStatus === 'available' || raw.lastCheckStatus === 'current' || raw.lastCheckStatus === 'failed'
        ? raw.lastCheckStatus
        : 'idle',
    lastSeenVersion: typeof raw.lastSeenVersion === 'string' ? raw.lastSeenVersion : null,
    latestReleaseUrl: typeof raw.latestReleaseUrl === 'string' ? raw.latestReleaseUrl : null,
    latestVersion: typeof raw.latestVersion === 'string' ? raw.latestVersion : null
  };
}

function parseVersion(value: string) {
  return value.replace(/^v/u, '').split(/[.-]/u).map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersionStrings(left: string, right: string) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const count = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < count; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function selectLatestPlatformRelease(manifest: UpdateManifest, currentVersion: string) {
  return manifest.releases
    .filter((release) => release.platforms.includes(WINDOWS_PLATFORM_ID) && compareVersionStrings(release.version, currentVersion) > 0)
    .sort((left, right) => compareVersionStrings(right.version, left.version))[0] ?? null;
}

function resolvePolicy(manifest: UpdateManifest | null, failed: boolean) {
  const defaultInterval = manifest?.channel === 'stable' ? STABLE_CHECK_INTERVAL_MINUTES : CHECK_INTERVAL_MINUTES;
  const intervalMinutes = clampMinutes(readNumber(manifest?.checkPolicy?.intervalMinutes), defaultInterval, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
  const failureRetryMinutes = clampMinutes(readNumber(manifest?.checkPolicy?.failureRetryMinutes), FAILURE_RETRY_MINUTES, MIN_FAILURE_RETRY_MINUTES, MAX_FAILURE_RETRY_MINUTES);
  return failed ? failureRetryMinutes : intervalMinutes;
}

export function shouldRunUpdateCheck(state: UpdateCheckState, now: number, force: boolean) {
  if (force || !state.lastCheckedAt) return true;
  const lastCheckedAt = Date.parse(state.lastCheckedAt);
  if (!Number.isFinite(lastCheckedAt)) return true;
  const intervalMinutes = resolvePolicy(state.cachedManifest, state.lastCheckStatus === 'failed');
  return now - lastCheckedAt >= intervalMinutes * 60 * 1000;
}

export function getUpdateCheckDelayMs(state: UpdateCheckState, now: number) {
  if (!state.lastCheckedAt) return 0;
  const lastCheckedAt = Date.parse(state.lastCheckedAt);
  if (!Number.isFinite(lastCheckedAt)) return 0;
  const intervalMinutes = resolvePolicy(state.cachedManifest, state.lastCheckStatus === 'failed');
  return Math.max(0, lastCheckedAt + intervalMinutes * 60 * 1000 - now);
}
