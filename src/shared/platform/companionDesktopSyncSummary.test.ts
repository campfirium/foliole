import { beforeEach, expect, it, vi } from 'vitest';

const diagnosticsMock = vi.hoisted(() => ({
  loadDesktopSyncDiagnostics: vi.fn(),
  loadLocalSyncDiagnostics: vi.fn()
}));

vi.mock('./companion/sync/diagnostics/companionSyncDiagnostics', () => diagnosticsMock);

beforeEach(() => {
  vi.resetAllMocks();
  diagnosticsMock.loadLocalSyncDiagnostics.mockResolvedValue({
    content: { missing_content_blob_count: 0 },
    sync_state: { local_dirty_count: 0, pack_cursor: 41, pending_ack_count: 0, push_issue_count: 0 }
  });
  diagnosticsMock.loadDesktopSyncDiagnostics.mockResolvedValue({
    sync_state: { max_state_seq: 52 }
  });
});

it('uses the structure position confirmed by the current desktop pass', async () => {
  const { loadCompanionDesktopSyncSummary } = await import('./companionDesktopSyncSummary');

  const summary = await loadCompanionDesktopSyncSummary('http://mac.local:38641', 52);

  expect(summary.remainingStructureChangeCount).toBe(0);
});

it('uses the diagnostic cursor when no structure pack ran', async () => {
  const { loadCompanionDesktopSyncSummary } = await import('./companionDesktopSyncSummary');

  const summary = await loadCompanionDesktopSyncSummary('http://mac.local:38641');

  expect(summary.remainingStructureChangeCount).toBe(11);
});

it('uses the completed identity probe instead of a foreign state sequence', async () => {
  const { loadCompanionDesktopSyncSummary } = await import('./companionDesktopSyncSummary');
  diagnosticsMock.loadLocalSyncDiagnostics.mockResolvedValue({
    content: { missing_content_blob_count: 0 },
    sync_state: { local_dirty_count: 3, pack_cursor: 1,
      pending_ack_count: 2, push_issue_count: 1 }
  });

  const summary = await loadCompanionDesktopSyncSummary('http://mac.local:38641',
    'identity-complete');

  expect(summary).toMatchObject({ remainingStructureChangeCount: 0,
    localDirtyCount: 0, pendingAckCount: 0, pushIssueCount: 0 });
  expect(diagnosticsMock.loadDesktopSyncDiagnostics).not.toHaveBeenCalled();
});
