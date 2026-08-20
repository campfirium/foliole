// @vitest-environment node

import { expect, it } from 'vitest';

import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';
import { inspectProtectedDesktopBoundary } from './macos-a5-pair-credentials-rejoin.mjs';

it('compares the A5 outbound route with the desktop local authorization', () => {
  const localAuthorization = 'authorization-desktop';
  const localFingerprint = authorizationFingerprint(localAuthorization);
  const overview = {
    pending_requests: [],
    sync_group: {
      group_id: 'group-1',
      local_host_name: 'Desktop',
      members: [
        { authorization_id: 'authorization-a5', host_name: 'A5', state: 'active' },
        { authorization_id: localAuthorization, host_name: 'Desktop', state: 'active' }
      ],
      timeline_id: 'timeline-1'
    }
  };
  const evidence = inspectProtectedDesktopBoundary(overview, {
    sanitize: () => ({
      desktopPeerFingerprint: 'different-device-identity', pendingDeviceFingerprints: []
    })
  }, {
    groupId: 'group-1', remotePeerFingerprint: localFingerprint, timelineId: 'timeline-1'
  }, [authorizationFingerprint('authorization-a5'), localFingerprint].sort());

  expect(evidence.actual).toMatchObject({
    desktopPeerFingerprint: 'different-device-identity',
    groupId: 'group-1',
    localMemberAuthorizationFingerprint: localFingerprint,
    pendingDeviceFingerprints: [],
    timelineId: 'timeline-1'
  });
  expect(evidence.expected.localMemberAuthorizationFingerprint).toBe(localFingerprint);
});
