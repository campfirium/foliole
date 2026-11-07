/* global AbortSignal, console, fetch */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { appleReadToken } from '../ios/testflight-publication.mjs';
import { IOS_APP_ID, IOS_GROUP_ID, IOS_INVITATION } from '../ios/testflight-candidate.mjs';
import { createMobileGithubApi, verifyStoredMobileCandidate } from './mobile-candidate-store.mjs';
import { createPlayApi, playAccessToken, readPlayReleases, PLAY_PACKAGE, PLAY_TRACK } from '../android/play-api.mjs';
import { checkRegisteredPlayAvailability, exactRelease } from '../android/play-availability.mjs';

export function channelProjection(candidate, state, url) {
  return {
    version: candidate.version,
    build: String(candidate.buildId ?? candidate.versionCode),
    status: state,
    ...(state === 'available' ? { url } : {})
  };
}

export function playReviewStatus(releases, candidate, fullRollout = false) {
  const release = exactRelease(releases, candidate);
  switch (release?.releaseLifecycleState) {
    case 'RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED':
      return 'verifying';
    case 'RELEASE_LIFECYCLE_STATE_PUBLISHED':
      return fullRollout ? 'available' : 'verifying';
    case 'RELEASE_LIFECYCLE_STATE_IN_REVIEW':
      return 'in-review';
    case 'RELEASE_LIFECYCLE_STATE_NOT_APPROVED':
      return 'rejected';
    default:
      return 'unavailable';
  }
}

export function testflightStatus(result, group, candidate) {
  const build = result.data;
  const related = name => result.included?.find(item =>
    item.id === build?.relationships?.[name]?.data?.id &&
    item.type === build?.relationships?.[name]?.data?.type)?.attributes;
  const version = related('preReleaseVersion');
  if (build?.id !== candidate.buildId || build.attributes?.version !== candidate.buildNumber ||
      build.relationships?.app?.data?.id !== IOS_APP_ID ||
      version?.version !== candidate.version || version.platform !== 'IOS' || group.data?.id !== IOS_GROUP_ID) {
    throw new Error('App Store Connect returned a different candidate.');
  }
  const state = related('buildBetaDetail')?.externalBuildState;
  if (state === 'BETA_REJECTED') return 'rejected';
  if (['WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW'].includes(state)) return 'in-review';
  if (build.attributes.expired || state === 'EXPIRED') return 'unavailable';
  if (['BETA_APPROVED', 'READY_FOR_BETA_TESTING'].includes(state)) return 'verifying';
  if (state !== 'IN_BETA_TESTING' || build.attributes.processingState !== 'VALID' ||
      !build.relationships?.betaGroups?.data?.some(entry => entry.id === IOS_GROUP_ID)) return 'unavailable';
  const attrs = group.data.attributes;
  return attrs?.isInternalGroup === false && attrs.publicLinkEnabled === true &&
    attrs.publicLink === IOS_INVITATION ? 'available' : 'unavailable';
}

async function queryApple(candidate) {
  if (!/^[0-9a-f-]+$/u.test(candidate.buildId)) throw new Error('Invalid Apple build identity.');
  const token = await appleReadToken();
  const get = async route => {
    const response = await fetch(`https://api.appstoreconnect.apple.com/v1/${route}`, {
      headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`App Store Connect returned HTTP ${response.status}.`);
    return response.json();
  };
  const [build, group] = await Promise.all([
    get(`builds/${candidate.buildId}?include=app,preReleaseVersion,buildBetaDetail,betaGroups`),
    get(`betaGroups/${IOS_GROUP_ID}`)
  ]);
  return testflightStatus(build, group, candidate);
}

async function queryPlay(candidate) {
  if (!Number.isSafeInteger(candidate.deploymentId)) throw new Error('Invalid Play deployment identity.');
  const github = createMobileGithubApi(process.env.GH_TOKEN);
  const row = verifyStoredMobileCandidate(await github('GET', `deployments/${candidate.deploymentId}`));
  const exact = row.payload.candidate;
  if (exact.version !== candidate.version || exact.versionCode !== candidate.versionCode ||
      exact.track !== PLAY_TRACK || exact.packageName !== PLAY_PACKAGE) throw new Error('Play candidate differs.');
  const play = createPlayApi(await playAccessToken(process.env.ANDROID_PLAY_SERVICE_ACCOUNT_JSON));
  const releases = await readPlayReleases(play);
  const published = exactRelease(releases, exact)?.releaseLifecycleState === 'RELEASE_LIFECYCLE_STATE_PUBLISHED';
  const rollout = published ? await checkRegisteredPlayAvailability({ play, github, registration: row }) : undefined;
  if (rollout === 'rejected') return 'rejected';
  return playReviewStatus(releases, exact, rollout === 'available');
}

async function project(id, candidate, query, url) {
  try {
    return [id, channelProjection(candidate, await query(candidate), url)];
  } catch (error) {
    console.error(`${id}: ${error.message}`);
    return [id, channelProjection(candidate, 'unavailable', url)];
  }
}

async function main() {
  const candidates = JSON.parse(await readFile('releases/store-candidates.json', 'utf8'));
  const channels = Object.fromEntries(await Promise.all([
    project('ios', candidates.ios, queryApple, IOS_INVITATION),
    project('android-play', candidates['android-play'], queryPlay,
      `https://play.google.com/apps/testing/${PLAY_PACKAGE}`)
  ]));
  await writeFile('.tmp/site-store-status.json', JSON.stringify(channels));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
