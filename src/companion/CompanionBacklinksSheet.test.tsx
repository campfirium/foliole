import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { CompanionBacklinksSheet } from './CompanionBacklinksSheet';
import { ReadingActionsSheet } from './CompanionReadingSheets';

const runtime = vi.hoisted(() => ({ native: false, load: vi.fn() }));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', async (importOriginal) => ({
  ...await importOriginal<typeof import('../shared/platform/companionWorkspaceRuntimeRepository')>(),
  isAvailableNativeCompanionRuntime: () => runtime.native
}));
vi.mock('../shared/platform/companion/reading/companionNodeBacklinks', () => ({
  loadCompanionNodeBacklinks: runtime.load
}));

function node(id: string, title: string, content: string) {
  return { id, title, content, kind: 'topic' };
}

const snapshot = {
  nodeOrder: ['target', 'a', 'b', 'trashed'],
  nodesById: {
    target: node('target', 'Topic', ''),
    a: node('a', 'Alpha', 'See [[topic]] and [[Topic]]'),
    b: node('b', 'Beta', 'Unrelated'),
    trashed: node('trashed', 'Gone', '[[Topic]]')
  },
  trashedNodeIds: ['trashed']
} as unknown as WorkspaceSnapshot;

beforeEach(() => {
  runtime.native = false;
  runtime.load.mockReset();
});

describe('CompanionBacklinksSheet', () => {
  it('lists linking topics from the snapshot and opens the source after flushing reading state', async () => {
    const onOpenNode = vi.fn();
    const onOpenChange = vi.fn();
    const flush = vi.fn(async () => undefined);
    render(<CompanionBacklinksSheet activity={{ editing: false, flush } as never} nodeId="target" snapshot={snapshot}
      onOpenChange={onOpenChange} onOpenNode={onOpenNode} open />);

    const row = await screen.findByRole('button', { name: /Alpha/ });
    expect(row).toHaveTextContent('Mentioned 2 times');
    expect(screen.queryByRole('button', { name: /Gone|Beta/ })).toBeNull();

    fireEvent.click(row);
    await waitFor(() => expect(onOpenNode).toHaveBeenCalledWith('a'));
    expect(flush).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not open a source after the sheet closes while saving the reading position', async () => {
    const onOpenNode = vi.fn();
    const onOpenChange = vi.fn();
    let finishFlush!: () => void;
    const flush = vi.fn(() => new Promise<void>(resolve => { finishFlush = resolve; }));
    const props = { activity: { editing: false, flush } as never, nodeId: 'target', snapshot, onOpenChange, onOpenNode };
    const { rerender } = render(<CompanionBacklinksSheet {...props} open />);

    fireEvent.click(await screen.findByRole('button', { name: /Alpha/ }));
    expect(flush).toHaveBeenCalledOnce();
    rerender(<CompanionBacklinksSheet {...props} open={false} />);
    await act(async () => finishFlush());

    expect(onOpenNode).not.toHaveBeenCalled();
  });

  it('reads the companion database on native runtimes and shows a short empty state', async () => {
    runtime.native = true;
    runtime.load.mockResolvedValue([]);
    render(<CompanionBacklinksSheet nodeId="target" snapshot={snapshot} onOpenChange={vi.fn()} onOpenNode={vi.fn()} open />);
    expect(await screen.findByText('No backlinks')).toBeInTheDocument();
    expect(runtime.load).toHaveBeenCalledWith('target');
  });

  it('offers retry when the database read fails', async () => {
    runtime.native = true;
    runtime.load.mockRejectedValueOnce(new Error('read failed')).mockResolvedValueOnce([
      { sourceNodeId: 'a', sourceTitle: 'Alpha', context: 'See [[Topic]]', matchCount: 1 }
    ]);
    render(<CompanionBacklinksSheet nodeId="target" snapshot={snapshot} onOpenChange={vi.fn()} onOpenNode={vi.fn()} open />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /Alpha/ })).toBeInTheDocument();
  });
});

describe('ReadingActionsSheet backlinks entry', () => {
  it('shows Backlinks only when the sheet can be opened', () => {
    const onOpenBacklinks = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(<ReadingActionsSheet onFindInDocument={vi.fn()} onOpenChange={onOpenChange}
      onOpenReadingSheet={vi.fn()} open />);
    expect(screen.queryByRole('button', { name: 'Backlinks' })).toBeNull();

    rerender(<ReadingActionsSheet onFindInDocument={vi.fn()} onOpenChange={onOpenChange}
      onOpenReadingSheet={vi.fn()} onOpenBacklinks={onOpenBacklinks} open />);
    fireEvent.click(screen.getByRole('button', { name: 'Backlinks' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenBacklinks).toHaveBeenCalled();
  });
});
