import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const diagnosticsMock = vi.hoisted(() => ({
  runCombinedSyncDiagnostics: vi.fn()
}));

vi.mock('../shared/platform/companionSyncDiagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/platform/companionSyncDiagnostics')>()),
  runCombinedSyncDiagnostics: diagnosticsMock.runCombinedSyncDiagnostics
}));

import { CompanionSyncDiagnosticsPanel } from './CompanionSyncDiagnosticsPanel';

const diagnosticResult = {
  android: {
    collected_at: '2026-04-29T00:00:00.000Z',
    connection: { endpoint_url: 'http://10.0.2.2:38641', last_error: null, state: 'ready' },
    content: { missing_content_blob_count: 0 },
    events: [{
      endpoint_url: 'http://10.0.2.2:38641',
      message: 'Completed auto sync.',
      occurred_at: '2026-04-29T01:20:00.000Z',
      status: 'completed'
    }, {
      endpoint_url: 'http://10.0.2.2:38641',
      message: 'Failed to apply companion desktop sync pack.',
      occurred_at: '2026-04-29T01:26:00.000Z',
      status: 'failed'
    }],
    host: 'android',
    identity: { app_version: null, device_id: 'android-device' },
    storage: { active_node_count: 2 },
    sync_state: { max_state_seq: 4, pack_cursor: 4, local_dirty_count: 1, state_counts: [] },
    verdicts: []
  },
  desktop: {
    collected_at: '2026-04-29T00:00:00.000Z',
    connection: { endpoint_url: 'http://127.0.0.1:38641', last_error: null, state: 'running' },
    content: { missing_content_blob_count: 0 },
    events: [],
    host: 'desktop',
    identity: { app_version: '0.1.0', device_id: 'desktop-device' },
    storage: { active_node_count: 2 },
    sync_state: {
      max_state_seq: 7,
      pack_cursor: null,
      local_dirty_count: 2,
      state_counts: [
        { count: 2, max_state_seq: 3, min_state_seq: 2, object_type: 'node' },
        { count: 1, max_state_seq: 7, min_state_seq: 7, object_type: 'view_state' }
      ]
    },
    verdicts: []
  },
  verdicts: [{
    code: 'sync_android_not_caught_up',
    evidence: { android_pack_cursor: 4, cursor_lag: 3, desktop_max_state_seq: 7 },
    message: 'Android has not caught up with desktop state.',
    severity: 'warning'
  }]
};

describe('CompanionSyncDiagnosticsPanel', () => {
  beforeEach(() => {
    diagnosticsMock.runCombinedSyncDiagnostics.mockReset();
    diagnosticsMock.runCombinedSyncDiagnostics.mockResolvedValue(diagnosticResult);
  });

  it('runs diagnostics on demand and shows checkpoint evidence', async () => {
    render(<CompanionSyncDiagnosticsPanel endpointUrl="http://10.0.2.2:38641" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run sync diagnostic' }));

    await waitFor(() => expect(screen.getByText('Android has not caught up with desktop state.')).toBeInTheDocument());
    expect(screen.getByText('Sync checkpoint')).toBeInTheDocument();
    expect(screen.getByText('Desktop ledger seq')).toBeInTheDocument();
    expect(screen.getByText('Android applied cursor')).toBeInTheDocument();
    expect(screen.getByText('3 state rows')).toBeInTheDocument();
    expect(screen.getByText('Lagging object types')).toBeInTheDocument();
    expect(screen.getByText('view_state +3')).toBeInTheDocument();
    expect(screen.getByText('1 Android / 2 Desktop')).toBeInTheDocument();
    expect(screen.getAllByText('failed: Failed to apply companion desktop sync pack.')).toHaveLength(2);
    expect(screen.getByText('A completed event exists, but the Android cursor is still behind desktop.')).toBeInTheDocument();
    expect(screen.getByText('Android')).toBeInTheDocument();
    expect(screen.getByText('Desktop')).toBeInTheDocument();
    expect(diagnosticsMock.runCombinedSyncDiagnostics).toHaveBeenCalledWith('http://10.0.2.2:38641');
  });
});
