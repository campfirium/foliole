import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const diagnosticsMock = vi.hoisted(() => ({
  runCombinedSyncDiagnostics: vi.fn()
}));
const convergenceMock = vi.hoisted(() => ({
  runSyncConvergenceCheck: vi.fn()
}));

vi.mock('../shared/platform/companionSyncDiagnostics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/platform/companionSyncDiagnostics')>()),
  runCombinedSyncDiagnostics: diagnosticsMock.runCombinedSyncDiagnostics
}));
vi.mock('../shared/platform/companionSyncConvergence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/platform/companionSyncConvergence')>()),
  runSyncConvergenceCheck: convergenceMock.runSyncConvergenceCheck
}));

import { CompanionSyncDiagnosticsPanel } from './CompanionSyncDiagnosticsPanel';

const diagnosticResult = {
  android: {
    collected_at: '2026-04-29T00:00:00.000Z',
    connection: { endpoint_url: 'http://10.0.2.2:38641', last_error: null, state: 'ready' },
    content: {
      active_topic: { body_status: 'missing', id: 'topic-1', title: 'Current topic' },
      missing_attachment_resource_bytes: 3145728,
      missing_attachment_resource_count: 2,
      missing_content_blob_bytes: 5242880,
      missing_content_blob_count: 5,
      missing_due_review_attachment_resource_count: 1,
      missing_due_review_body_count: 2,
      missing_external_document_body_count: 1,
      missing_image_attachment_resource_bytes: 1048576,
      missing_image_attachment_resource_count: 1,
      missing_nested_topic_body_count: 3,
      missing_other_attachment_resource_bytes: 524288,
      missing_other_attachment_resource_count: 1,
      missing_pdf_attachment_resource_bytes: 1572864,
      missing_pdf_attachment_resource_count: 1,
      missing_top_level_topic_body_count: 1,
      missing_topic_body_count: 4
    },
    events: [{
      endpoint_url: 'http://10.0.2.2:38641',
      message: 'Completed auto sync.',
      occurred_at: '2026-04-29T01:20:00.000Z',
      status: 'completed'
    }, {
      endpoint_url: 'http://10.0.2.2:38641',
      message: 'Failed to apply companion desktop sync pack.',
      occurred_at: '2026-04-29T01:18:00.000Z',
      status: 'failed'
    }],
    host: 'android',
    identity: { app_version: null, device_id: 'android-device' },
    storage: { active_node_count: 2 },
    sync_state: {
      dirty_objects: [{
        content_hash: 'hash-review',
        object_id: 'node-1',
        object_type: 'node_review',
        state_seq: 4,
        updated_at: '2026-04-29T01:24:00.000Z'
      }],
      max_state_seq: 4,
      pack_cursor: 4,
      local_dirty_count: 1,
      pending_ack_count: 1,
      pending_acks: [{
        acked_at: '2026-04-29T01:25:00.000Z',
        client_op_id: 'node_review:node-1:4',
        object_id: 'node-1',
        object_type: 'node_review',
        state_seq: 7,
        status: 'accepted'
      }],
      state_counts: [
        { count: 1, dirty_count: 1, max_state_seq: 4, min_state_seq: 4, object_type: 'node_review' }
      ]
    },
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
        { count: 2, dirty_count: 0, max_state_seq: 3, min_state_seq: 2, object_type: 'node' },
        { count: 1, dirty_count: 0, max_state_seq: 7, min_state_seq: 7, object_type: 'view_state' }
      ]
    },
    verdicts: []
  },
  verdicts: [{
    code: 'sync_android_not_caught_up',
    evidence: { android_pack_cursor: 4, cursor_lag: 3, desktop_max_state_seq: 7 },
    message: 'New desktop changes are available for this device.',
    severity: 'info'
  }]
};

function expectDiagnosticSummary() {
  expect(screen.getByText('What this means')).toBeInTheDocument();
  expect(screen.queryByText('sync_android_not_caught_up')).not.toBeInTheDocument();
  expect(screen.getByText('Foliole will bring them in on the next sync.')).toBeInTheDocument();
  expect(screen.getByText('Sync status')).toBeInTheDocument();
  expect(screen.getByText('Convergence check')).toBeInTheDocument();
  expect(screen.getByText('Blocked')).toBeInTheDocument();
  expect(screen.getByText('Latest completed event is not fully converged')).toBeInTheDocument();
  expect(screen.getByText('Completed was recorded while 1 dirty change(s), 1 pending ack(s), 5 body blob(s), 2 attachment file(s), and 3 structure change(s) remain.')).toBeInTheDocument();
}

function expectStageCheckpoint() {
  expect(screen.getByText('Topic list')).toBeInTheDocument();
  expect(screen.getByText('Stage 1 · Library index')).toBeInTheDocument();
  expect(screen.getByText('Stage 2 · FSRS priority')).toBeInTheDocument();
  expect(screen.getByText('Stage 3 · Topic bodies')).toBeInTheDocument();
  expect(screen.getByText('Stage 4 · Attachments')).toBeInTheDocument();
  expect(screen.getByText('2 bodies, 1 attachment remaining')).toBeInTheDocument();
  expect(screen.queryByText('Not tracked yet')).not.toBeInTheDocument();
  expect(screen.getByText('5 remaining')).toBeInTheDocument();
  expect(screen.getByText('2 remaining')).toBeInTheDocument();
  expect(screen.getByText('New desktop changes')).toBeInTheDocument();
  expect(screen.getByText('Topic bodies still caching')).toBeInTheDocument();
}

function expectCheckpointDetails() {
  expect(screen.getByText('Current topic')).toBeInTheDocument();
  expect(screen.getByText('Caching: Current topic')).toBeInTheDocument();
  expect(screen.getByText('Finished pass')).toBeInTheDocument();
  expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  expect(screen.getByText('3 changes')).toBeInTheDocument();
  expect(screen.queryByText('Lagging object types')).not.toBeInTheDocument();
  expect(screen.getByText('2 on device / 2 on desktop')).toBeInTheDocument();
  expect(screen.queryByText('failed: Failed to apply companion desktop sync pack.')).not.toBeInTheDocument();
  expect(screen.queryByText('A completed event exists, but the Android cursor is still behind desktop.')).not.toBeInTheDocument();
}

function expectAndroidDiagnosticRows() {
  expect(screen.getByText('Android')).toBeInTheDocument();
  expect(screen.getAllByText('Object types')).toHaveLength(2);
  expect(screen.getAllByText('node_review')).toHaveLength(3);
  expect(screen.getByText('1 waiting')).toBeInTheDocument();
  expect(screen.getByText('Device changes waiting')).toBeInTheDocument();
  expect(screen.getAllByText('Body bytes still caching').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Attachment bytes still caching').length).toBeGreaterThan(0);
  expect(screen.getByText('Due review bodies')).toBeInTheDocument();
  expect(screen.getByText('Top-level topic bodies')).toBeInTheDocument();
  expect(screen.getByText('Nested topic bodies')).toBeInTheDocument();
  expect(screen.getByText('Due review attachments')).toBeInTheDocument();
  expect(screen.getByText('Image attachments')).toBeInTheDocument();
  expect(screen.getByText('PDF attachments')).toBeInTheDocument();
  expect(screen.getByText('Other attachments')).toBeInTheDocument();
}

function expectDiagnosticTables() {
  expect(screen.getAllByText('5.0 MB').length).toBeGreaterThan(0);
  expect(screen.getAllByText('3.0 MB').length).toBeGreaterThan(0);
  expect(screen.getByText('Desktop confirmations waiting')).toBeInTheDocument();
  expect(screen.getByText('accepted')).toBeInTheDocument();
  expect(screen.getByText('seq 7')).toBeInTheDocument();
  expect(screen.getAllByText('node-1').length).toBeGreaterThan(0);
  expect(screen.getByText('seq 4')).toBeInTheDocument();
  expect(screen.getByText('Desktop')).toBeInTheDocument();
}

describe('CompanionSyncDiagnosticsPanel', () => {
  beforeEach(() => {
    diagnosticsMock.runCombinedSyncDiagnostics.mockReset();
    diagnosticsMock.runCombinedSyncDiagnostics.mockResolvedValue(diagnosticResult);
    convergenceMock.runSyncConvergenceCheck.mockReset();
    convergenceMock.runSyncConvergenceCheck.mockResolvedValue({
      diagnostics: diagnosticResult,
      report: {
        status: 'blocked',
        checks: [{
          code: 'completed_event_with_local_work',
          detail: 'Completed was recorded while 1 dirty change(s) and 1 pending ack(s) remain.',
          severity: 'error',
          title: 'Latest completed event is not fully converged'
        }]
      }
    });
  });

  it('runs diagnostics on demand and shows checkpoint evidence', async () => {
    render(<CompanionSyncDiagnosticsPanel endpointUrl="http://10.0.2.2:38641" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run sync diagnostic' }));

    await waitFor(() => expect(screen.getByText('New desktop changes are available')).toBeInTheDocument());
    expectDiagnosticSummary();
    expectStageCheckpoint();
    expectCheckpointDetails();
    expectAndroidDiagnosticRows();
    expectDiagnosticTables();
    expect(diagnosticsMock.runCombinedSyncDiagnostics).toHaveBeenCalledWith('http://10.0.2.2:38641');
    expect(convergenceMock.runSyncConvergenceCheck).not.toHaveBeenCalled();
  });

  it('runs convergence check on demand and shows invariant failures', async () => {
    render(<CompanionSyncDiagnosticsPanel endpointUrl="http://10.0.2.2:38641" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run convergence check' }));

    await waitFor(() => expect(screen.getByText('Convergence check')).toBeInTheDocument());
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('Latest completed event is not fully converged')).toBeInTheDocument();
    expect(screen.getByText('Completed was recorded while 1 dirty change(s) and 1 pending ack(s) remain.')).toBeInTheDocument();
    expect(convergenceMock.runSyncConvergenceCheck).toHaveBeenCalledWith('http://10.0.2.2:38641');
  });

  it('shows checked instead of the internal skipped status', async () => {
    diagnosticsMock.runCombinedSyncDiagnostics.mockResolvedValue({
      ...diagnosticResult,
      android: {
        ...diagnosticResult.android,
        events: [{
          endpoint_url: 'http://10.0.2.2:38641',
          message: 'Some topic bodies are still being cached.',
          occurred_at: '2026-04-29T01:20:00.000Z',
          status: 'skipped'
        }]
      }
    });
    render(<CompanionSyncDiagnosticsPanel endpointUrl="http://10.0.2.2:38641" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run sync diagnostic' }));

    await waitFor(() => expect(screen.getByText('Checked')).toBeInTheDocument());
    expect(screen.queryByText('Skipped')).not.toBeInTheDocument();
  });
});
