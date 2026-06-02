import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionSettingsList } from './CompanionSettingsContent';
import { CompanionSyncDiagnosticCheckpoint } from './CompanionSyncDiagnosticCheckpoint';
import { DirtyObjectRows } from './CompanionSyncDiagnosticsRows';

import { NodeBrowseList } from '@/shared/ui';

function renderDiagnosticCheckpoint() {
  render(
    <CompanionSyncDiagnosticCheckpoint
      result={{
        android: {
          content: {},
          events: [],
          storage: {},
          sync_state: {}
        },
        desktop: {
          storage: {},
          sync_state: {}
        }
      } as Parameters<typeof CompanionSyncDiagnosticCheckpoint>[0]['result']}
    />
  );
}

describe('companion mobile text wrapping', () => {
  it('allows settings detail text to use two lines', () => {
    render(
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
    render(
      <DirtyObjectRows
        rows={[{
          content_hash: 'abcdef1234567890',
          object_id: 'very-long-object-id-without-natural-breaks-1234567890',
          object_type: 'external_document_body',
          state_seq: 42
        }]}
      />
    );

    expect(screen.getByText('very-long-object-id-without-natural-breaks-1234567890').className).toContain('break-all');
  });

  it('uses two-line topic titles and one-line folder titles in browse lists', () => {
    render(
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
