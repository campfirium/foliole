/* global AbortSignal, console, fetch */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createPlayApi, PLAY_TRACK, readPlayReleases } from '../android/play-api.mjs';
import { exactRelease, isCompletePlayTrack } from '../android/play-availability.mjs';
import { playEditPath } from '../android/play-edit-id.mjs';

const project = 'foliole-play-distribution';
const reader = `foliole-play-read-probe@${project}.iam.gserviceaccount.com`;
const identity = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const impersonation = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${reader}:generateAccessToken`;
const published = 'RELEASE_LIFECYCLE_STATE_PUBLISHED';

async function readToken(fetchImpl, url, options, key) {
  const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Google credential request failed (HTTP ${response.status})`);
  const token = (await response.json())[key];
  if (typeof token !== 'string' || !token) throw new Error('Google returned no access token');
  return token;
}

export async function cloudPlayReadToken(fetchImpl = fetch) {
  const workloadToken = await readToken(fetchImpl, identity, {
    headers: { 'Metadata-Flavor': 'Google' }
  }, 'access_token');
  return readToken(fetchImpl, impersonation, {
    method: 'POST',
    headers: { authorization: `Bearer ${workloadToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ scope: ['https://www.googleapis.com/auth/androidpublisher'], lifetime: '600s' })
  }, 'accessToken');
}

export async function probePlayRollout(play, { version, versionCode, sourceSha }) {
  if (!/^\d+\.\d+\.\d+$/u.test(version) || !Number.isSafeInteger(versionCode) || versionCode < 1 ||
      !/^[0-9a-f]{40}$/u.test(sourceSha)) throw new Error('An exact Play candidate is required');
  const candidate = { track: PLAY_TRACK, version, versionCode, sourceSha };
  const state = async () => exactRelease(await readPlayReleases(play), candidate)?.releaseLifecycleState;
  if (await state() !== published) return false;

  const edit = playEditPath((await play('POST', 'edits', {})).id);
  let complete;
  try {
    complete = isCompletePlayTrack(await play('GET', `${edit}/tracks/${PLAY_TRACK}`), candidate);
  } finally {
    await play('DELETE', edit);
  }
  return complete && await state() === published;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , version, code, sourceSha] = process.argv;
  const play = createPlayApi(await cloudPlayReadToken());
  const available = await probePlayRollout(play, { version, versionCode: Number(code), sourceSha });
  console.log(JSON.stringify({ version, versionCode: Number(code), available }));
}
