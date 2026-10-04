// @vitest-environment node
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  baseline: vi.fn(async () => null),
  recordBaseline: vi.fn(async () => {}),
  probe: vi.fn(),
  page: vi.fn(() => ({ page: { objects: [] as unknown[] } })),
  drain: vi.fn(async () => {})
}));

vi.mock('../../lib/core/sync/syncIdentityPeerBaseline.js', () => ({
  loadSyncIdentityPeerBaseline: mocks.baseline,
  recordSyncIdentityPeerBaseline: mocks.recordBaseline
}));
vi.mock('../database/betterSqliteDbPort.js', () => ({
  createBetterSqliteDbPort: () => ({})
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ sqlite: {} }),
  runWithDatabaseConnectionOwner: (task: () => unknown) => task()
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_key: 'secret' })
}));
vi.mock('./desktopSyncIdentityProbe.js', () => ({
  probeDesktopSyncIdentities: mocks.probe
}));
vi.mock('./desktopSyncIdentityCandidatePages.js', () => ({
  readDesktopSyncIdentityCandidatePage: mocks.page
}));
vi.mock('./desktopSyncIdentityPack.js', () => ({
  downloadAndApplyDesktopSyncIdentityPage: async () => ({ applied: true })
}));
vi.mock('./desktopSyncIdentityPush.js', () => ({
  uploadDesktopSyncIdentityPage: async () => ({ applied: true })
}));
vi.mock('./desktopSyncGroupResourceArticleDrain.js', () => ({
  drainDesktopSyncIdentityResources: mocks.drain
}));

it('rejects a round with remaining identity differences without recording a baseline', async () => {
  const cleanup = vi.fn(async () => {});
  mocks.probe.mockReset();
  mocks.recordBaseline.mockClear();
  mocks.probe.mockResolvedValueOnce({ count: 1, usedTimeCandidates: false,
    candidatePath: '/tmp/candidates', sourceViewId: 'source-view',
    localViewId: 'local-view', localViewPath: '/tmp/local-view', cleanup });
  const { runDesktopSyncIdentityRound } = await import('./desktopSyncIdentityRound.js');
  await expect(runDesktopSyncIdentityRound({ endpoint_url: 'http://peer', group_id: 'group',
    local_device_id: 'local', peer_device_id: 'peer', peer_device_name: 'Peer',
    peer_platform: 'mac' })).rejects.toThrow('sync_identity_round_incomplete');
  expect(mocks.probe).toHaveBeenCalledTimes(1);
  expect(mocks.recordBaseline).not.toHaveBeenCalled();
  expect(cleanup).toHaveBeenCalledTimes(1);
});

it('counts pages and candidates from subsequent adopted position exchanges', async () => {
  mocks.probe.mockReset();
  mocks.page.mockReturnValue({ page: { objects: [{ object_type: 'node', object_id: 'position' }] } });
  let probes = 0;
  mocks.probe.mockImplementation(async () => {
    probes += 1;
    return { count: probes === 5 ? 0 : 1, candidatePath: `/candidates-${probes}`,
      sourceViewId: `source-${probes}`, localViewId: `local-${probes}`,
      localViewPath: `/local-${probes}`, cleanup: async () => {} };
  });
  try {
    const { runDesktopSyncIdentityRound } = await import('./desktopSyncIdentityRound.js');
    await expect(runDesktopSyncIdentityRound({ endpoint_url: 'http://peer', group_id: 'group',
      local_device_id: 'local', peer_device_id: 'peer', peer_device_name: 'Peer',
      peer_platform: 'mac' })).resolves.toMatchObject({ candidateCount: 4,
      verifiedCandidateCount: 0, received: { appliedPages: 2, pageCount: 2 },
      sent: { appliedPages: 2, pageCount: 2 } });
    expect(probes).toBe(5);
  } finally { mocks.page.mockReturnValue({ page: { objects: [] } }); }
});
