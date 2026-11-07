// @vitest-environment node
import { expect, it } from 'vitest';
import { channelProjection, playReviewStatus, testflightStatus } from './site-store-status.mjs';
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

it('opens the enabled TestFlight group link only after the exact build is published', () => {
  const candidate = { version: '0.8.0', buildId: 'build-id', buildNumber: '4.1' };
  const group = { data: { id: IOS_GROUP_ID, attributes: { isInternalGroup: false,
    publicLinkEnabled: true, publicLink: IOS_INVITATION } } };
  const observe = (state) => channelProjection(candidate, testflightStatus({
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
  }, group, candidate), IOS_INVITATION);

  expect(observe('IN_BETA_REVIEW')).not.toHaveProperty('url');
  expect(observe('BETA_REJECTED')).not.toHaveProperty('url');
  expect(observe('BETA_APPROVED')).toMatchObject({ status: 'verifying' });
  expect(observe('READY_FOR_BETA_TESTING')).not.toHaveProperty('url');
  expect(observe('IN_BETA_TESTING')).toMatchObject({ status: 'available', url: IOS_INVITATION });
});
