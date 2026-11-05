/* global AbortSignal, fetch, URLSearchParams */
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';

export const PLAY_PACKAGE = 'com.campfirium.foliole.android';
export const PLAY_TRACK = 'beta';
const ROOT = 'https://androidpublisher.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export async function playAccessToken(json, fetchImpl = fetch) {
  let account;
  try { account = JSON.parse(json); } catch { throw new Error('Play service account JSON is missing or invalid'); }
  if (account.type !== 'service_account' || !account.client_email?.endsWith('.iam.gserviceaccount.com') || !account.private_key) {
    throw new Error('A dedicated Play service account is required');
  }
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claim = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email,
    scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  let signature;
  try { signature = createSign('RSA-SHA256').update(claim).sign(account.private_key, 'base64url'); }
  catch { throw new Error('Play service account private key is invalid'); }
  const response = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error',
    signal: AbortSignal.timeout(30000), body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${claim}.${signature}` }) });
  if (!response.ok) throw new Error(`Play authentication failed (HTTP ${response.status})`);
  const result = await response.json();
  if (!result.access_token) throw new Error('Play authentication returned no token');
  return result.access_token;
}

export function createPlayApi(token, fetchImpl = fetch) {
  if (!token) throw new Error('Play access token is required');
  return async (method, route, body, binary = false) => {
    const prefix = binary ? '/upload/androidpublisher/v3/applications/' : '/androidpublisher/v3/applications/';
    let response;
    try {
      response = await fetchImpl(`${ROOT}${prefix}${PLAY_PACKAGE}/${route}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(binary ? 600000 : 30000),
        headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? {
          'content-type': binary ? 'application/octet-stream' : 'application/json' } : {}) },
        ...(body !== undefined ? { body: binary ? body : JSON.stringify(body) } : {})
      });
    } catch { throw new Error(`Play ${method} request outcome is unknown; reconcile the saved edit before retrying`); }
    // Never include response bodies, tokens or request bodies in logs.
    if (!response.ok) {
      const error = new Error(`Play ${method} failed (HTTP ${response.status}); preserve the saved edit`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? {} : response.json();
  };
}

export function createPlayApkDownloader(token, fetchImpl = fetch) {
  if (!token) throw new Error('Play access token is required');
  return async (versionCode, downloadId) => {
    if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000 ||
        typeof downloadId !== 'string' || !downloadId.trim()) throw new Error('Exact generated APK identity is required');
    const route = `generatedApks/${versionCode}/downloads/${encodeURIComponent(downloadId)}:download?alt=media`;
    let response;
    try {
      response = await fetchImpl(`${ROOT}/androidpublisher/v3/applications/${PLAY_PACKAGE}/${route}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(120000),
        headers: { authorization: `Bearer ${token}` }
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch { throw new Error('Play APK download failed; retry the same candidate without uploading'); }
    throw new Error(`Play APK download failed (HTTP ${response.status})`);
  };
}

export async function readPlayReleases(api) {
  const result = await api('GET', `tracks/${PLAY_TRACK}/releases`);
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Play release inventory is unavailable');
  }
  const releases = result.releases === undefined ? [] : result.releases;
  if (!Array.isArray(releases)) throw new Error('Play release inventory is unavailable');
  return releases;
}

export function requireNoPendingReview(releases) {
  const allowed = new Set(['RELEASE_LIFECYCLE_STATE_PUBLISHED', 'RELEASE_LIFECYCLE_STATE_NOT_APPROVED']);
  if (releases.some(release => !allowed.has(release.releaseLifecycleState))) {
    throw new Error('Existing Play changes need attention; preserve pending review and do not upload');
  }
}
