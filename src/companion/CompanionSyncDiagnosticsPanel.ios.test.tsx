import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const diagnosticsMock = vi.hoisted(() => ({ runCombinedSyncDiagnostics: vi.fn() }));

vi.mock('../shared/platform/companion/sync/diagnostics/companionSyncDiagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/platform/companion/sync/diagnostics/companionSyncDiagnostics')>()),
  runCombinedSyncDiagnostics: diagnosticsMock.runCombinedSyncDiagnostics
}));

import type { SyncDiagnosticSnapshot } from '../../lib/platform/syncDiagnosticsContract';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSyncDiagnosticsPanel } from './CompanionSyncDiagnosticsPanel';

const iosSnapshot: SyncDiagnosticSnapshot = {
  collected_at: '2026-07-21T00:00:00.000Z',
  connection: { endpoint_url: 'http://192.168.1.2:38641', last_error: null, state: 'ready' },
  content: { missing_content_blob_count: 0 },
  events: [],
  host: 'ios',
  identity: { app_version: '0.1.0', device_id: 'ios-device' },
  storage: {
    active_node_count: 1,
    content_blob_count: 1,
    external_document_count: 0,
    missing_node_state_count: 0,
    missing_node_version_count: 0,
    node_blob_references_missing_rows: 0
  },
  sync_state: {
    dirty_objects: [{
      content_hash: 'ios-dirty-hash',
      object_id: 'ios-dirty-node',
      object_type: 'node_review',
      state_seq: 8,
      updated_at: '2026-07-21T00:00:00.000Z'
    }],
    local_dirty_count: 1,
    max_state_seq: 8,
    pack_cursor: 8,
    pending_ack_count: 1,
    pending_acks: [{
      acked_at: '2026-07-21T00:00:00.000Z',
      client_op_id: 'ios-pending-op',
      object_id: 'ios-pending-node',
      object_type: 'node_review',
      state_seq: 8,
      status: 'accepted'
    }],
    push_issue_count: 1,
    push_issues: [{
      acked_at: '2026-07-21T00:00:00.000Z',
      client_op_id: 'ios-issue-op',
      object_id: 'ios-issue-node',
      object_type: 'node_review',
      state_seq: 9,
      status: 'conflict'
    }],
    ready_dirty_count: 1,
    state_counts: []
  },
  verdicts: []
};

describe('CompanionSyncDiagnosticsPanel on iOS', () => {
  it('shows the native device diagnostic queues', async () => {
    diagnosticsMock.runCombinedSyncDiagnostics.mockResolvedValue({
      android: iosSnapshot,
      desktop: null,
      verdicts: []
    });
    renderWithLocalization(<CompanionSyncDiagnosticsPanel endpointUrl={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run sync diagnostic' }));

    await waitFor(() => expect(screen.getByText('ios-dirty-node')).toBeInTheDocument());
    expect(screen.getByText('ios-pending-node')).toBeInTheDocument();
    expect(screen.getByText('ios-issue-node')).toBeInTheDocument();
    expect(screen.getByText('Device changes waiting')).toBeInTheDocument();
    expect(screen.getByText('Desktop confirmations waiting')).toBeInTheDocument();
    expect(screen.getByText('Device changes not sent')).toBeInTheDocument();
  });
});
