// @vitest-environment node
import { expect, it } from 'vitest';
import { URLSearchParams } from 'node:url';
import { channelProjection, checkTestflightReviews, storeChannelForWebsite, testflightStatus } from './site-store-status.mjs';
import { checkPendingPlayCandidates } from '../android/play-review-check.mjs';
import { readPlayPublicDownloads } from './play-public-downloads.mjs';
import { availabilityFixture } from '../android/play-availability-test-fixture.mjs';
import { createPlayRegistration } from './mobile-candidate-provenance.mjs';
import { registrationFixture } from './mobile-candidate-test-fixtures.mjs';
import { registerTestflightReview } from './testflight-review-registry.mjs';
import { IOS_APP_ID, IOS_GROUP_ID, IOS_INVITATION } from '../ios/testflight-candidate.mjs';

function observedTestflightStatus(candidate, state) {
  const group = { data: { id: IOS_GROUP_ID, attributes: { isInternalGroup: false,
    publicLinkEnabled: true, publicLink: IOS_INVITATION } } };
  return testflightStatus({
    data: {
      id: candidate.buildId,
      attributes: { version: candidate.buildNumber, expired: false, processingState: 'VALID' },
      relationships: {
        app: { data: { id: IOS_APP_ID } },
        betaGroups: { data: [{ id: IOS_GROUP_ID }] },
        preReleaseVersion: { data: { type: 'preReleaseVersions', id: 'version-id' } },
        buildBetaDetail: { data: { type: 'buildBetaDetails', id: 'detail-id' } }
      }
    },
    included: [
      { type: 'preReleaseVersions', id: 'version-id', attributes: { version: candidate.version, platform: 'IOS' } },
      { type: 'buildBetaDetails', id: 'detail-id', attributes: { externalBuildState: state } }
    ]
  }, group, candidate);
}

it('opens the enabled TestFlight group link only after the exact build is published', () => {
  const candidate = { version: '0.8.0', buildId: 'build-id', buildNumber: '4.1' };
  const observe = state => channelProjection(candidate, observedTestflightStatus(candidate, state), IOS_INVITATION);

  expect(observe('IN_BETA_REVIEW')).not.toHaveProperty('url');
  expect(observe('BETA_REJECTED')).not.toHaveProperty('url');
  expect(observe('BETA_APPROVED')).toMatchObject({ status: 'verifying' });
  expect(observe('READY_FOR_BETA_TESTING')).not.toHaveProperty('url');
  expect(observe('IN_BETA_TESTING')).toMatchObject({ status: 'available', url: IOS_INVITATION });
});

function deploymentApi(rows) {
  return async (method, route, body) => {
    if (method === 'POST') {
      const row = { ...body, sha: body.ref, creator: { login: 'github-actions[bot]' } };
      rows.push(row);
      return row;
    }
    const sha = new URLSearchParams(route.split('?')[1]).get('sha');
    return rows.filter(row => !sha || row.sha === sha);
  };
}

function reviewReceipt(revision, version, buildNumber) {
  const sourceSha = revision.repeat(40);
  return { schemaVersion: 1, sourceSha, acceptedSha: sourceSha, version, buildNumber, runId: '123',
    buildId: `build-${revision}`, ipaSha256: revision.repeat(64), appId: IOS_APP_ID, groupId: IOS_GROUP_ID,
    channel: 'testflight', invitationUrl: IOS_INVITATION, externalBuildState: 'WAITING_FOR_BETA_REVIEW',
    executionLane: revision === 'b' ? 'qa-mobile-beta' : 'release-t7' };
}

it('resumes every independently submitted TestFlight build after the sending job exits', async () => {
  const first = reviewReceipt('a', '0.8.1', '5.1');
  const second = reviewReceipt('b', '0.8.2', '6.1');
  const third = reviewReceipt('c', '0.8.3', '7.1');
  const rows = [];
  for (const receipt of [first, second, third, first]) await registerTestflightReview(deploymentApi(rows), receipt);
  expect(rows).toHaveLength(3);

  const states = new Map([first, second, third].map(({ buildId }) => [buildId, 'IN_BETA_REVIEW']));
  const check = () => checkTestflightReviews(deploymentApi(rows), first,
    candidate => observedTestflightStatus(candidate, states.get(candidate.buildId)));
  expect(await check()).toMatchObject([third, second, first].map(({ version, buildId, buildNumber }) =>
    ({ version, build: buildId, buildNumber, status: 'in-review' })));

  states.set(first.buildId, 'IN_BETA_TESTING');
  states.set(second.buildId, 'BETA_REJECTED');
  expect(await check()).toMatchObject([
    { build: third.buildId, status: 'in-review' },
    { build: second.buildId, status: 'rejected', releaseSourceSha: undefined },
    { build: first.buildId, status: 'available', url: IOS_INVITATION, releaseSourceSha: first.sourceSha }
  ]);
});

it('keeps a verified TestFlight build linked as the next build moves through review', async () => {
  const older = reviewReceipt('a', '0.8.1', '5.1');
  const newer = reviewReceipt('b', '0.8.2', '6.1');
  const api = deploymentApi([]);
  await registerTestflightReview(api, newer);
  const states = new Map([[older.buildId, 'IN_BETA_TESTING'], [newer.buildId, 'IN_BETA_REVIEW']]);
  const channel = async () => storeChannelForWebsite(await checkTestflightReviews(api, older,
    candidate => observedTestflightStatus(candidate, states.get(candidate.buildId))));
  expect(await channel()).toEqual({
    version: older.version, build: older.buildId, status: 'update-in-review', url: IOS_INVITATION
  });
  states.set(older.buildId, 'EXPIRED');
  expect(await channel()).toEqual({ version: newer.version, build: newer.buildId, status: 'in-review' });
  states.set(newer.buildId, 'IN_BETA_TESTING');
  expect(await channel()).toEqual({
    version: newer.version, build: newer.buildId, status: 'available', url: IOS_INVITATION
  });
});

it('shares persisted Play availability through review, query failure, rollout and halt', async () => {
  const f = await availabilityFixture();
  try {
    const fixture = registrationFixture('release-t7');
    fixture.candidate.version = '0.8.1';
    fixture.candidate.versionCode = 5;
    const newer = { ...f.row, id: 72, payload: createPlayRegistration(fixture) };
    const update = { track: 'beta',
      releaseName: `0.8.1.5.${fixture.candidate.sourceSha.slice(0, 9)}`,
      activeArtifacts: [{ versionCode: 5 }], releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' };
    f.lifecycle = 'PUBLISHED';
    const check = () => checkPendingPlayCandidates(f.clients());
    const reviews = () => readPlayPublicDownloads(f.clients().github);
    const channel = async () => storeChannelForWebsite(await reviews());
    const url = 'https://play.google.com/apps/testing/com.campfirium.foliole.android';

    f.histories.get(71).unshift(f.status('Play availability: available'));
    f.histories.get(71).unshift(...Array.from({ length: 101 }, () => f.status('Play availability: checking')));
    expect(await channel()).toMatchObject({ build: '4', status: 'available', url });
    f.rows.push(newer);
    f.extraReleases = [update];
    f.histories.set(72, [f.status('Play candidate: observed')]);
    await check();
    expect(await channel()).toMatchObject({ build: '4', status: 'update-in-review', url });
    expect((await reviews())[0]).not.toHaveProperty('url');

    const fail = () => checkPendingPlayCandidates({
      ...f.clients(), readInventory: async () => { throw new Error('Play HTTP 403'); }
    });
    await expect(fail()).rejects.toThrow('Play HTTP 403');
    expect(await channel()).toMatchObject({ build: '4', status: 'update-in-review', url });

    update.releaseLifecycleState = 'RELEASE_LIFECYCLE_STATE_PUBLISHED';
    f.track.releases = [{ name: update.releaseName, versionCodes: ['5'], status: 'completed' }];
    await check();
    expect(await channel()).toMatchObject({ build: '5', status: 'available', url });
    expect(await reviews()).toEqual([{
      version: '0.8.1', build: '5', status: 'available', url,
      releaseSourceSha: fixture.candidate.sourceSha, releaseLane: 'release-t7'
    }]);

    f.track.releases[0].status = 'halted';
    await check();
    await expect(fail()).rejects.toThrow('Play HTTP 403');
    expect(await channel()).toEqual({ version: '0.8.1', build: '5', status: 'unavailable' });
    expect(f.edits.size).toBe(0);
  } finally {
    await f.close();
  }
});
