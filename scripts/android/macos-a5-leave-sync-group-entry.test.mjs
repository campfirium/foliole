// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';
import { runMacosA5LeaveSyncGroupEntry } from './macos-a5-leave-sync-group-entry.mjs';
import { leaveJoinedEmptyCredentialSession } from './macos-a5-pair-credentials-rejoin.mjs';

function entryArgs(events) {
  return {
    assertFixed: () => events.push('fixed'), build: () => events.push('android-build'),
    buildIdentity: () => 'build-1', checked: (_command, args) => {
      if (args.includes('install')) events.push('main-install');
    },
    env: {}, execute: vi.fn(), paths: { adb: '/adb', apk: '/app.apk', repoRoot: '/repo' },
    serial: '87a33a4b'
  };
}

it('opens the protected Desktop peer before the fixed product Leave', async () => {
  const events = [];
  const result = await runMacosA5LeaveSyncGroupEntry(entryArgs(events), {
    assertJoinedEmpty: (readiness) => { events.push('guard'); return readiness; },
    buildDesktop: () => events.push('desktop-build'),
    collectReadiness: async () => { events.push('snapshot'); return { groupId: 'group-1' }; },
    leaveJoinedEmpty: async (args) => {
      events.push('desktop-session-leave');
      expect(args).toMatchObject({ baseline: { groupId: 'group-1' }, buildIdentity: 'build-1',
        evidenceRoot: path.join('/repo', '.tmp/artifacts/a5-sync-group-maintenance/build-1') });
      return { manifestPath: '/evidence/leave.json' };
    },
    resolveReadiness: () => { events.push('readiness'); return { joinedEmptyReauthorization: true }; }
  });

  expect(events).toEqual(['fixed', 'readiness', 'android-build', 'desktop-build',
    'snapshot', 'guard', 'main-install', 'desktop-session-leave']);
  expect(result.manifestPath).toBe('/evidence/leave.json');
});

it('does not install or open Desktop when the joined-empty guard fails', async () => {
  const events = [];
  const leaveJoinedEmpty = vi.fn();
  await expect(runMacosA5LeaveSyncGroupEntry(entryArgs(events), {
    assertJoinedEmpty: () => { throw new Error('joined-empty drift'); },
    buildDesktop: () => events.push('desktop-build'), collectReadiness: async () => ({}),
    leaveJoinedEmpty, resolveReadiness: () => ({})
  })).rejects.toThrow('joined-empty drift');
  expect(events).not.toContain('main-install');
  expect(leaveJoinedEmpty).not.toHaveBeenCalled();
});

it('closes the protected Desktop session when product Leave fails', async () => {
  const session = { assertActive: vi.fn(), close: vi.fn().mockResolvedValue(),
    enable: vi.fn().mockResolvedValue({ paired_authorizations: [], pending_requests: [],
      server_status: { port: 38641, state: 'running' }, sync_enabled: true, sync_group: {
        group_id: 'group-1', local_host_name: 'desktop', timeline_id: 'timeline-1', members: [
          { authorization_id: 'desktop-auth', host_name: 'desktop', state: 'active' },
          { authorization_id: 'a5-auth', host_name: 'a5', state: 'active' }
        ] } }), sanitize: () => ({
      localAuthorizationFingerprint: authorizationFingerprint('desktop-auth'),
      pendingAuthorizationFingerprints: []
    }) };
  await expect(leaveJoinedEmptyCredentialSession({ baseline: {
    groupId: 'group-1', localMemberAuthorizationFingerprint: authorizationFingerprint('a5-auth'),
    remotePeerAuthorizationFingerprint: authorizationFingerprint('desktop-auth'),
    timelineId: 'timeline-1'
  }, buildIdentity: 'build-1', env: {}, evidenceRoot: '/evidence', execute: vi.fn(),
  paths: { repoRoot: '/repo' }, serial: '87a33a4b' }, {
    maintenance: async () => { throw new Error('leave failed'); }, openSession: async () => session,
    writeBoundaryEvidence: vi.fn()
  })).rejects.toThrow('leave failed');
  expect(session.close).toHaveBeenCalledOnce();
});
