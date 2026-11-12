/* global AbortSignal, console, fetch */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { appleReadToken } from '../ios/testflight-publication.mjs';
import { IOS_APP_ID, IOS_GROUP_ID, IOS_INVITATION } from '../ios/testflight-candidate.mjs';
import { createMobileGithubApi } from './mobile-candidate-store.mjs';
import { readPlayPublicDownloads } from './play-public-downloads.mjs';
import { listTestflightReviews } from './testflight-review-registry.mjs';

export function channelProjection(candidate, state, url) {
  return {
    version: candidate.version,
    build: String(candidate.buildId ?? candidate.versionCode),
    status: state,
    ...(state === 'available' ? { url } : {})
  };
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

async function observeChannel(id, candidate, query) {
  try {
    return await query(candidate);
  } catch (error) {
    console.error(`${id}: ${error.message}`);
    return channelProjection(candidate, 'unavailable');
  }
}

export function storeChannelForWebsite(reviews) {
  const latest = reviews[0];
  const available = reviews.find(review => review.status === 'available');
  const { version, build, status, url } = available ?? latest;
  const updateInReview = available && latest.status === 'in-review';
  return { version, build, status: updateInReview ? 'update-in-review' : status, ...(url ? { url } : {}) };
}

export async function checkTestflightReviews(api, historicalCandidate, query = queryApple) {
  const candidates = await listTestflightReviews(api, historicalCandidate);
  return Promise.all(candidates.map(async candidate => {
    const review = await observeChannel(`ios ${candidate.version} (${candidate.buildNumber})`, candidate,
      async () => channelProjection(candidate, await query(candidate), IOS_INVITATION));
    const releaseSourceSha = candidate.executionLane === 'release-t7' ? candidate.sourceSha : undefined;
    return { ...review, buildNumber: candidate.buildNumber, releaseSourceSha };
  }));
}

async function main() {
  const candidates = JSON.parse(await readFile('releases/store-candidates.json', 'utf8'));
  const github = createMobileGithubApi(process.env.GH_TOKEN);
  const [reviews, playReviews] = await Promise.all([
    checkTestflightReviews(github, candidates.ios),
    readPlayPublicDownloads(github)
  ]);
  const channels = { ios: storeChannelForWebsite(reviews) };
  if (playReviews.length) channels['android-play'] = storeChannelForWebsite(playReviews);
  await writeFile('.tmp/site-store-status.json', JSON.stringify(channels));
  await writeFile('.tmp/testflight-review-status.json', JSON.stringify(reviews));
  await writeFile('.tmp/play-release-status.json', JSON.stringify(playReviews));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
