// @vitest-environment node

import { expect, it } from 'vitest';

import { joinedEmptyCredentialFixture } from './android-departed-credential-fixture.mjs';
import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';
import {
  assertJoinedEmptyCredentialReauthorization
} from './macos-a5-pair-credentials-rejoin.mjs';

it('requires pairing authorization to match the current group route before Leave', () => {
  expect(assertJoinedEmptyCredentialReauthorization(joinedEmptyCredentialFixture))
    .toMatchObject({ groupId: 'group-1' });
  expect(() => assertJoinedEmptyCredentialReauthorization({
    ...joinedEmptyCredentialFixture,
    pairingPeerAuthorizationFingerprint: authorizationFingerprint('wrong-peer')
  })).toThrow('exact joined-empty');
  expect(() => assertJoinedEmptyCredentialReauthorization({
    ...joinedEmptyCredentialFixture,
    storedAuthorizationFingerprint: authorizationFingerprint('wrong-local')
  })).toThrow('exact joined-empty');
});
