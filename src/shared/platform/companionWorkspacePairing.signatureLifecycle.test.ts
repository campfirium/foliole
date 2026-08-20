import { beforeEach, expect, it, vi } from 'vitest';

const events: string[] = [];
const groupMock = vi.hoisted(() => ({
  facts: vi.fn(), join: vi.fn(), load: vi.fn(), loadKey: vi.fn(), refresh: vi.fn()
}));
const nativeMock = vi.hoisted(() => ({
  bindSyncGroupPeerRoute: vi.fn(),
  clearPairingCredentials: vi.fn(),
  desktopHttpRequest: vi.fn(),
  loadDiscoveryCandidates: vi.fn(),
  loadPairingState: vi.fn(),
  signCompanionSyncRequest: vi.fn(),
  startSyncGroupProvider: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => nativeMock
}));
vi.mock('./companionPairingEncryption', () => ({
  createCompanionPairingPublicKey: vi.fn(async () => 'client-public-key'),
  decryptCompanionPairingSecret: vi.fn(async () => 'persistent-workgroup-key'),
  dropCompanionPairingPrivateKey: vi.fn()
}));
vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: vi.fn(async <T>(task: () => Promise<T>) => task())
}));
vi.mock('./companion/sync/syncGroupStore', async (importOriginal) => ({
  ...await importOriginal<typeof import('./companion/sync/syncGroupStore')>(),
  joinCompanionSyncGroup: groupMock.join,
  loadCompanionSyncGroup: groupMock.load,
  loadCompanionSyncGroupLibraryFacts: groupMock.facts,
  loadCompanionSyncGroupWorkgroupKey: groupMock.loadKey,
  refreshActiveCompanionSyncGroupMembership: groupMock.refresh
}));

import { pairCompanionWithDesktop, requestCompanionPairing } from './companionWorkspacePairing';

const endpointUrl = 'http://10.0.0.25:38641';
const protocol = {
  capabilities: ['lan-sync-v1'], max_supported_version: 1, min_supported_version: 1, version: 1
};
const compatibility = {
  missing_capabilities: [], negotiated_version: 1, reason: null, status: 'compatible'
};
const encryptedSecret = {
  algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM', ciphertext: 'ciphertext', iv: 'iv',
  salt: 'salt', server_public_key: 'server-public-key'
};
const group = {
  created_at: '2026-08-20T08:00:00.000Z', created_by_host_name: 'Desktop',
  display_name: 'Daily', group_id: 'group-fresh-join', local_host_name: 'A5',
  local_member_state: 'active' as const,
  members: [
    { approved_by_host_name: 'Desktop', authorization_id: 'authorization-a5', host_name: 'A5',
      host_platform: 'android-capacitor', joined_at: '2026-08-20T08:00:00.000Z', state: 'active' as const },
    { approved_by_host_name: 'Desktop', authorization_id: 'authorization-provider', host_name: 'Desktop',
      host_platform: 'darwin', joined_at: '2026-08-20T08:00:00.000Z', state: 'active' as const }
  ],
  timeline_id: 'timeline-1'
};

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  groupMock.load.mockResolvedValue(null);
  groupMock.loadKey.mockResolvedValue(null);
  groupMock.facts.mockResolvedValue({
    attachment_count: 0, content_blob_count: 0, node_count: 0,
    review_log_count: 0, timeline_id: null
  });
  nativeMock.desktopHttpRequest
    .mockResolvedValueOnce({ body: JSON.stringify({
      compatibility, desktop_protocol: protocol, expires_at: '2026-08-20T08:02:00.000Z',
      pair_request_id: 'pair-request-1', status: 'pending'
    }), status: 202 })
    .mockResolvedValueOnce({ body: JSON.stringify({
      authorization_id: 'authorization-a5', compatibility, desktop_protocol: protocol,
      device_id: 'device-a5', encrypted_credential_secret: encryptedSecret,
      host_name: 'A5', host_platform: 'android-capacitor', paired_at: '2026-08-20T08:00:00.000Z',
      peer_id: 'device-provider', provider_authorization_id: 'authorization-provider',
      provider_device_id: 'device-provider', provider_encrypted_credential_secret: encryptedSecret,
      provider_host_name: 'Desktop', provider_host_platform: 'darwin', sync_group: group
    }), status: 200 });
  groupMock.join.mockImplementation(async () => {
    events.push('group-committed');
    groupMock.load.mockResolvedValue(group);
    groupMock.loadKey.mockResolvedValue('persistent-workgroup-key');
  });
  nativeMock.bindSyncGroupPeerRoute.mockImplementation(async () => {
    events.push('route-committed');
  });
  nativeMock.signCompanionSyncRequest.mockImplementation(async () => {
    events.push('signature-probe');
    return { headers: {
      'X-Authorization-Id': 'authorization-a5', 'X-Nonce': 'nonce',
      'X-Signature': 'signed', 'X-Timestamp': '2026-08-20T08:00:00.000Z'
    } };
  });
  nativeMock.loadPairingState.mockResolvedValue({ is_paired: false });
});

it('proves fresh Sync Group pairing can sign after persistence and route binding', async () => {
  await completeFreshPairing();

  expect(events).toEqual(['group-committed', 'route-committed', 'signature-probe']);
  expect(nativeMock.signCompanionSyncRequest).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_url: endpointUrl, sync_group_id: group.group_id,
    workgroup_key: 'persistent-workgroup-key'
  }));
  expect(nativeMock.desktopHttpRequest).toHaveBeenCalledTimes(2);
  expect(nativeMock.loadDiscoveryCandidates).not.toHaveBeenCalled();
  expect(nativeMock.startSyncGroupProvider).not.toHaveBeenCalled();
});

it('keeps committed credentials when the local signature-only probe fails', async () => {
  nativeMock.signCompanionSyncRequest.mockImplementation(async () => {
    events.push('signature-probe');
    throw new Error('signature rejected');
  });

  await expect(completeFreshPairing()).rejects.toThrow(
    'Native pairing credentials cannot sign sync requests: signature rejected'
  );

  expect(events).toEqual(['group-committed', 'route-committed', 'signature-probe']);
  expect(nativeMock.clearPairingCredentials).not.toHaveBeenCalled();
  expect(nativeMock.startSyncGroupProvider).not.toHaveBeenCalled();
});

async function completeFreshPairing() {
  await requestCompanionPairing({
    deviceId: 'device-a5', deviceKind: 'android-capacitor', deviceName: 'A5', endpointUrl,
    groupId: group.group_id, groupTag: 'group-tag', timelineId: group.timeline_id
  });

  return pairCompanionWithDesktop({
    deviceKind: 'android-capacitor', deviceName: 'A5', endpointUrl,
    groupId: group.group_id, groupTag: 'group-tag', pairRequestId: 'pair-request-1'
  });
}
