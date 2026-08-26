// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureGroup: vi.fn(),
  loadBootstrap: vi.fn(),
  loadGroup: vi.fn(),
  postResult: vi.fn(),
  saveActive: vi.fn(),
  saveEndpoint: vi.fn(),
  saveReading: vi.fn(),
  saveReview: vi.fn(),
  saveSetting: vi.fn(),
  saveView: vi.fn(),
  sync: vi.fn()
}));

vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: mocks.loadBootstrap }));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({ loadCompanionSyncGroup: mocks.loadGroup }));
vi.mock('../shared/platform/companionDesktopSyncObjects', () => ({ syncCompanionObjectsFromDesktop: mocks.sync }));
vi.mock('../shared/platform/companionSyncStateWriters', () => ({
  saveCompanionSyncActiveViewState: mocks.saveActive,
  saveCompanionSyncNodeReadingRecord: mocks.saveReading,
  saveCompanionSyncNodeReviewRecord: mocks.saveReview,
  saveCompanionSyncNodeViewState: mocks.saveView,
  saveCompanionSyncSettingRecord: mocks.saveSetting
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  saveCompanionWorkspaceSyncEndpoint: mocks.saveEndpoint
}));
vi.mock('./iosBridgeAcceptance', () => ({
  acceptanceEndpoint: () => 'http://127.0.0.1:43123',
  postResult: mocks.postResult
}));
vi.mock('./iosAcceptanceSyncGroup', () => ({ ensureIosAcceptanceSyncGroup: mocks.ensureGroup }));

import { runIosStateWritebackAcceptance } from './iosStateWritebackAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadBootstrap.mockResolvedValue({ database_path: '/app/foliole.db' });
  mocks.loadGroup.mockResolvedValue(null);
  mocks.ensureGroup.mockResolvedValue({ group: { group_id: 'group-1' }, joined: true });
  mocks.sync.mockResolvedValue({ pushedObjectIds: [] });
});

it('seeds the node, writes through shared writers, and confirms on the first launch', async () => {
  await runIosStateWritebackAcceptance();

  expect(mocks.sync).toHaveBeenCalledTimes(2);
  expect(mocks.sync).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:43123', { includeResources: false });
  expect(mocks.saveActive).toHaveBeenCalledWith('ios-state-node');
  expect(mocks.saveView).toHaveBeenCalledWith({ nodeId: 'ios-state-node', scrollTop: 42 });
  expect(mocks.saveReading).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'ios-state-node' }));
  expect(mocks.saveReview).toHaveBeenCalledWith(expect.objectContaining({
    nodeId: 'ios-state-node', reviewLog: expect.objectContaining({ schedulerVersion: 'fsrs-6' })
  }));
  expect(mocks.saveSetting).toHaveBeenCalledWith({
    key: 'handoff_reminder_settings', valueJson: '{"enabled":true}'
  });
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'applied', status: 'passed' }));
});

it('syncs without rewriting state after process restart', async () => {
  mocks.loadGroup.mockResolvedValue({ group_id: 'group-1' });

  await runIosStateWritebackAcceptance();

  expect(mocks.loadBootstrap).toHaveBeenCalledOnce();
  expect(mocks.loadBootstrap.mock.invocationCallOrder[0] ?? Infinity)
    .toBeLessThan(mocks.sync.mock.invocationCallOrder[0] ?? -Infinity);
  expect(mocks.sync).toHaveBeenCalledOnce();
  expect(mocks.saveActive).not.toHaveBeenCalled();
  expect(mocks.saveReading).not.toHaveBeenCalled();
  expect(mocks.saveReview).not.toHaveBeenCalled();
  expect(mocks.saveSetting).not.toHaveBeenCalled();
  expect(mocks.saveView).not.toHaveBeenCalled();
  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({ phase: 'reapplied', status: 'passed' }));
});

it('posts a structured sync failure', async () => {
  mocks.loadGroup.mockResolvedValue({ group_id: 'group-1' });
  mocks.sync.mockRejectedValue(new Error('push rejected'));

  await runIosStateWritebackAcceptance();

  expect(mocks.postResult).toHaveBeenCalledWith(expect.objectContaining({
    error: 'push rejected', phase: 'failed', scenario: 'state-writeback-runtime', status: 'failed'
  }));
});
