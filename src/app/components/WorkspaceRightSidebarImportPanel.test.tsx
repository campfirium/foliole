import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { selectRuntimeImportTextFile } from '../../shared/platform/importBridge';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';
import { resetFormalImportState } from '../hooks/useFormalImport';

import { WorkspaceRightSidebarImportPanel } from './WorkspaceRightSidebarImportPanel';

vi.mock('../../shared/platform/importBridge', () => ({
  selectRuntimeImportTextFile: vi.fn()
}));

function mockDesktopBridge() {
  window.electronAPI = {
    invoke: vi.fn().mockResolvedValue(null),
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

describe('WorkspaceRightSidebarImportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFormalImportState();
    mockDesktopBridge();
    useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-03-22T08:00:00.000Z')));
  });

  it('keeps quick capture and formal import visibly separated', () => {
    render(<WorkspaceRightSidebarImportPanel />);

    expect(screen.getByRole('heading', { name: 'Import entry points' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quick capture' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Formal import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quick capture stays in editor' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import Markdown / TXT file' })).toBeEnabled();
  });

  it('shows dedicated import status rows', () => {
    render(<WorkspaceRightSidebarImportPanel />);

    expect(screen.getByRole('heading', { name: 'Import status' })).toBeInTheDocument();
    expect(screen.getByText('No imports yet')).toBeInTheDocument();
    expect(screen.getByText('Imported files land as child nodes under Inbox')).toBeInTheDocument();
    expect(screen.getByText('Nothing recorded')).toBeInTheDocument();
  });

  it('imports the selected Markdown file into Inbox', async () => {
    vi.mocked(selectRuntimeImportTextFile).mockResolvedValue({
      content: '# Imported note\nBody',
      fileName: 'imported-note.md',
      filePath: '/tmp/imported-note.md',
      kind: 'markdown'
    });

    const initialInboxChildren = Object.values(useWorkspaceStore.getState().nodesById).filter(
      (node) => node.parentNodeId === INBOX_NODE_ID
    );

    render(<WorkspaceRightSidebarImportPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Import Markdown / TXT file' }));

    await waitFor(() => {
      const inboxChildren = Object.values(useWorkspaceStore.getState().nodesById).filter(
        (node) => node.parentNodeId === INBOX_NODE_ID
      );
      expect(inboxChildren).toHaveLength(initialInboxChildren.length + 1);
      expect(inboxChildren.some((node) => node.content === '# Imported note\nBody')).toBe(true);
    });

    expect(screen.getByText(/Imported imported-note\.md/)).toBeInTheDocument();
    expect(screen.getByText('Inbox child created from imported-note.md')).toBeInTheDocument();
    expect(screen.getByText('Nothing recorded')).toBeInTheDocument();
  });
});
