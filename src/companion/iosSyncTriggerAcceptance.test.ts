import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  begin: vi.fn(),
  bootstrap: vi.fn(),
  load: vi.fn(),
  postResult: vi.fn(),
  record: vi.fn()
}));

vi.mock('../shared/platform/companionSyncActivityEvents', () => ({ createCompanionSyncRunId: () => 'run-new' }));
vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: runtime.bootstrap }));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  beginNativeCompanionSyncRun: runtime.begin
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionWorkspaceSyncState: runtime.load,
  recordCompanionWorkspaceSyncEvent: runtime.record
}));
vi.mock('./iosBridgeAcceptance', () => ({ postResult: runtime.postResult }));

import { runIosSyncTriggerAcceptance } from './iosSyncTriggerAcceptance';

const event = { kind: 'run_finished', trigger_reason: 'manual' };

beforeEach(() => {
  vi.clearAllMocks();
  runtime.bootstrap.mockResolvedValue({ database_path: '/acceptance.db' });
  runtime.begin.mockResolvedValue({ reason: 'manual', run_id: 'run-new', runtime: 'ios' });
  runtime.record.mockResolvedValue(undefined);
  runtime.load.mockResolvedValueOnce({ sync_events: [] }).mockResolvedValueOnce({ sync_events: [event] });
});

it('calls the native manual command and persists its shared-owner result', async () => {
  await runIosSyncTriggerAcceptance();

  expect(runtime.bootstrap).toHaveBeenCalledOnce();
  expect(runtime.begin).toHaveBeenCalledWith('manual', 'run-new');
  expect(runtime.record).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'run_finished', result: 'completed', runId: 'run-new', triggerReason: 'manual'
  }));
  expect(runtime.postResult).toHaveBeenCalledWith(expect.objectContaining({
    durable_result: true, native_runtime: 'ios', previous_result_restored: false,
    scenario: 'sync-trigger-runtime', status: 'passed', trigger_reason: 'manual'
  }));
});

it('reports that the previous result was restored on a later launch', async () => {
  runtime.load.mockReset();
  runtime.load.mockResolvedValue({ sync_events: [event] });

  await runIosSyncTriggerAcceptance();

  expect(runtime.postResult).toHaveBeenCalledWith(expect.objectContaining({ previous_result_restored: true }));
});
