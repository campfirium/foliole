import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  SyncDiagnosticHost,
  SyncDiagnosticSnapshot
} from '../../lib/platform/syncDiagnosticsContract';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSettingsList } from './CompanionSettingsContent';
import { CompanionSyncDiagnosticCheckpoint } from './CompanionSyncDiagnosticCheckpoint';
import { DirtyObjectRows } from './CompanionSyncDiagnosticsRows';

import { NodeBrowseList } from '@/shared/ui';

function createSyncSnapshot(host: SyncDiagnosticHost): SyncDiagnosticSnapshot {
  return {
    collected_at: '2026-06-03T00:00:00.000Z',
    connection: { endpoint_url: null, last_error: null, state: 'ready' },
    content: { missing_content_blob_count: 0 },
    events: [],
    host,
    identity: { app_version: null, device_id: host },
    storage: {
      active_node_count: 0,
      content_blob_count: 0,
      external_document_count: 0,
      missing_node_state_count: 0,
      missing_node_version_count: 0,
      node_blob_references_missing_rows: 0
    },
    sync_state: {
      local_dirty_count: 0,
      max_state_seq: null,
      pack_cursor: null,
      state_counts: []
    },
    verdicts: []
  };
}

function renderDiagnosticCheckpoint() {
  renderWithLocalization(
    <CompanionSyncDiagnosticCheckpoint
      result={{
        android: createSyncSnapshot('android'),
        desktop: createSyncSnapshot('desktop'),
        verdicts: []
      }}
    />
  );
}

describe('companion mobile text wrapping', () => {
  it('allows settings detail text to use two lines', () => {
    renderWithLocalization(
      <CompanionSettingsList
        onOpenAppearance={vi.fn()}
        onOpenDebug={vi.fn()}
        onOpenDevice={vi.fn()}
        onOpenStorage={vi.fn()}
        onOpenSync={vi.fn()}
      />
    );

    expect(screen.getByText('Diagnostics and development details will appear here.').className).toContain('line-clamp-2');
  });

  it('stacks dense sync diagnostic metrics on mobile', () => {
    renderDiagnosticCheckpoint();

    const row = screen.getByText('External document bodies to download').parentElement;
    expect(row?.className).toContain('grid-cols-1');
    expect(row?.className).toContain('sm:grid-cols-[minmax(0,1fr)_auto]');
  });

  it('wraps long diagnostic object identifiers instead of truncating them', () => {
    renderWithLocalization(
      <DirtyObjectRows
        rows={[{
          content_hash: 'abcdef1234567890',
          object_id: 'very-long-object-id-without-natural-breaks-1234567890',
          object_type: 'external_document_body',
          state_seq: 42,
          updated_at: '2026-06-03T00:00:00.000Z'
        }]}
      />
    );

    expect(screen.getByText('very-long-object-id-without-natural-breaks-1234567890').className).toContain('break-all');
  });

  it('uses two-line topic titles and one-line folder titles in browse lists', () => {
    renderWithLocalization(
      <NodeBrowseList
        currentNodeId={null}
        emptyLabel="No topics"
        items={[
          { kind: 'topic', nodeId: 'topic-1', preview: null, title: 'Long topic title' },
          { kind: 'folder', nodeId: 'folder-1', preview: null, title: 'Long folder title' }
        ]}
        onSelectNode={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Long topic title' }).className).toContain('line-clamp-2');
    expect(screen.getByRole('heading', { name: 'Long folder title' }).className).toContain('truncate');
  });
});
