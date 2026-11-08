// @vitest-environment node
import { expect, it } from 'vitest';
import { URLSearchParams } from 'node:url';
import { channelProjection, checkTestflightReviews, playReviewStatus, testflightStatus } from './site-store-status.mjs';
import { registerTestflightReview } from './testflight-review-registry.mjs';
import { IOS_APP_ID, IOS_GROUP_ID, IOS_INVITATION } from '../ios/testflight-candidate.mjs';

it('opens the Play opt-in link only after the exact build is published', () => {
  const candidate = { version: '0.8.1', versionCode: 5, track: 'beta', sourceSha: '2bc09f006' };
  const url = 'https://play.google.com/apps/testing/com.campfirium.foliole.android';
  const observe = (state, versionCode = 5, fullRollout = false) => channelProjection(candidate, playReviewStatus([{
    track: 'beta', releaseName: '0.8.1.5.2bc09f006', activeArtifacts: [{ versionCode }],
    releaseLifecycleState: `RELEASE_LIFECYCLE_STATE_${state}`
  }], candidate, fullRollout), url);

  expect(observe('IN_REVIEW')).not.toHaveProperty('url');
  expect(observe('NOT_APPROVED')).not.toHaveProperty('url');
  expect(observe('APPROVED_NOT_PUBLISHED', 4)).not.toHaveProperty('url');
  expect(observe('APPROVED_NOT_PUBLISHED')).toMatchObject({ status: 'verifying' });
  expect(observe('PUBLISHED')).not.toHaveProperty('url');
  expect(observe('PUBLISHED', 5, true)).toMatchObject({ status: 'available', url, version: '0.8.1' });
});

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
