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
