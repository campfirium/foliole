import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import { showAppRuntimeNotice } from '../ui/AppRuntimeNotice';

import { loadAppVersion } from './appVersion';
import { openFolioleReleaseLink } from './releaseLinks';
import { openExternalUrl } from './runtimeExternalNavigation';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';
import {
  DEFAULT_UPDATE_STATE,
  getUpdateCheckDelayMs,
  normalizeReleaseNotesCatalog,
  normalizeUpdateManifest,
  normalizeUpdateState,
  selectLatestPlatformRelease,
  shouldRunUpdateCheck,
  type UpdateCheckState,
  type UpdateReleaseNotesByLocale,
  type UpdateRelease
} from './updateCheckModel';

export {
  compareVersionStrings,
  normalizeReleaseNotesCatalog,
  normalizeUpdateManifest,
  selectLatestPlatformRelease,
  selectSkippedPlatformReleases
} from './updateCheckModel';
export type { UpdateCheckState, UpdateRelease, UpdateReleaseNotes } from './updateCheckModel';

const DEFAULT_MANIFEST_URL = 'https://campfirium.github.io/foliole/releases/update-manifest.json';
const UPDATE_NOTES_LOCALES = ['en', 'zh-Hans'] as const;

export interface UpdateCheckResult {
  latestRelease: UpdateRelease | null;
  state: UpdateCheckState;
  status: 'available' | 'current' | 'failed' | 'skipped';
}

const updateCheckStateSubscribers = new Set<() => void>();

function getManifestUrl() {
  const configured = import.meta.env.VITE_FOLIOLE_UPDATE_MANIFEST_URL as string | undefined;
  return configured?.trim() || DEFAULT_MANIFEST_URL;
}

function getNotesUrl(manifestUrl: string, locale: (typeof UPDATE_NOTES_LOCALES)[number]) {
  return new URL(`notes/${locale}.json`, manifestUrl).toString();
}

async function fetchReleaseNotes(manifestUrl: string): Promise<UpdateReleaseNotesByLocale | null> {
  const entries = await Promise.all(UPDATE_NOTES_LOCALES.map(async (locale) => {
    try {
      const response = await fetch(getNotesUrl(manifestUrl, locale), { cache: 'no-store' });
      if (!response.ok) return null;
      const catalog = normalizeReleaseNotesCatalog(await response.json());
      return catalog ? [locale, catalog] as const : null;
    } catch {
      return null;
    }
  }));
  const releaseNotes = Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
  return Object.keys(releaseNotes).length ? releaseNotes : null;
}


export function readUpdateCheckState(): UpdateCheckState {
  try {
    return normalizeUpdateState(JSON.parse(getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState) ?? 'null'));
  } catch {
    return DEFAULT_UPDATE_STATE;
  }
}

function writeUpdateCheckState(state: UpdateCheckState) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify(state));
  updateCheckStateSubscribers.forEach((subscriber) => subscriber());
}

export function subscribeUpdateCheckState(subscriber: () => void) {
  updateCheckStateSubscribers.add(subscriber);
  return () => {
    updateCheckStateSubscribers.delete(subscriber);
  };
}

export function getNextUpdateCheckDelayMs(now = Date.now()) {
  return getUpdateCheckDelayMs(readUpdateCheckState(), now);
}

function showUpdateCheckNotice(result: UpdateCheckResult, manual: boolean) {
  if (result.status === 'available' && result.latestRelease) {
    showAppRuntimeNotice(`Foliole ${result.latestRelease.version} is available. Open Releases to download.`, 'success');
    return;
  }
  if (!manual) return;
  if (result.status === 'current') {
    showAppRuntimeNotice('Foliole is up to date.', 'success');
    return;
  }
  if (result.status === 'failed') {
    showAppRuntimeNotice('Could not check for updates.');
  }
}

export async function checkForFolioleUpdates(options: { force?: boolean; notify?: boolean } = {}): Promise<UpdateCheckResult> {
  const state = readUpdateCheckState();
  const now = Date.now();
  if (!shouldRunUpdateCheck(state, now, Boolean(options.force))) {
    return { latestRelease: null, state, status: 'skipped' };
  }

  try {
    const manifestUrl = getManifestUrl();
    const [currentVersion, response] = await Promise.all([
      loadAppVersion(),
      fetch(manifestUrl, { cache: 'no-store' })
    ]);
    if (!response.ok) throw new Error(`update manifest request failed: ${response.status}`);
    const manifest = normalizeUpdateManifest(await response.json());
    if (!manifest) throw new Error('update manifest payload invalid');
    const latestRelease = selectLatestPlatformRelease(manifest, currentVersion);
    const cachedReleaseNotes = latestRelease ? await fetchReleaseNotes(manifestUrl) : state.cachedReleaseNotes;
    const nextState: UpdateCheckState = {
      cachedReleaseNotes,
      cachedManifest: manifest,
      dismissedVersion: state.dismissedVersion,
      lastCheckedAt: new Date(now).toISOString(),
      lastCheckStatus: latestRelease ? 'available' : 'current',
      lastSeenVersion: latestRelease ? latestRelease.version : state.lastSeenVersion,
      latestReleaseUrl: latestRelease?.url ?? null,
      latestVersion: latestRelease?.version ?? null
    };
    writeUpdateCheckState(nextState);
    const result: UpdateCheckResult = {
      latestRelease,
      state: nextState,
      status: latestRelease ? 'available' : 'current'
    };
    if (options.notify && (options.force || latestRelease?.version !== state.lastSeenVersion)) {
      showUpdateCheckNotice(result, Boolean(options.force));
    }
    return result;
  } catch {
    const nextState = {
      ...state,
      lastCheckedAt: new Date(now).toISOString(),
      lastCheckStatus: 'failed' as const
    };
    writeUpdateCheckState(nextState);
    const result: UpdateCheckResult = { latestRelease: null, state: nextState, status: 'failed' };
    if (options.notify) showUpdateCheckNotice(result, Boolean(options.force));
    return result;
  }
}

export function openFolioleLatestRelease() {
  const state = readUpdateCheckState();
  return state.latestReleaseUrl ? openExternalUrl(state.latestReleaseUrl) : openFolioleReleaseLink('releases');
}
