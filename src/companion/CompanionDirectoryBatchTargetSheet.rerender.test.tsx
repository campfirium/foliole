import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionDirectoryBatchTargetSheet } from './CompanionDirectoryBatchTargetSheet';
import { buildBatchMoveDestinationTree } from './companionMoveDestinationTree';

vi.mock('./companionMoveDestinationTree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./companionMoveDestinationTree')>();
  return { ...actual, buildBatchMoveDestinationTree: vi.fn(actual.buildBatchMoveDestinationTree) };
});

function node(id: string, parentNodeId: string | null, kind: WorkspaceNodeSnapshot['kind']): WorkspaceNodeSnapshot {
  return {
    anchorLink: null,
    content: '',
    hideTitleHeading: false,
    id,
    isTitleManual: false,
    kind,
    parentNodeId,
    reading: null,
    reveal: null,
    title: id
  } as WorkspaceNodeSnapshot;
}

const nodesById = {
  folder: node('folder', null, 'folder'),
  other: node('other', null, 'folder'),
  a: node('a', 'folder', 'topic'),
  b: node('b', 'folder', 'topic')
};

// A stable workspace whose busy state flips, as it does while a pick or save is in progress.
const workspace = (busy: boolean) => ({ busy, failure: null, pending: false, snapshot: { nodesById } });

vi.mock('./CompanionWorkspaceActions', () => ({
  useCompanionWorkspaceActions: () => (globalThis as { __workspace?: unknown }).__workspace
}));

// The host rebuilds the targets array on every render, as CompanionDirectoryBatchSelection does.
function Sheet(props: { busy: boolean }) {
  (globalThis as { __workspace?: unknown }).__workspace = workspace(props.busy);
  return (
    <CompanionDirectoryBatchTargetSheet
      action="move"
      onClose={() => undefined}
      onSaved={() => undefined}
      targets={[{ id: 'a', version: 'v1' }, { id: 'b', version: 'v1' }]}
    />
  );
}

describe('CompanionDirectoryBatchTargetSheet re-renders', () => {
  beforeEach(() => {
    vi.mocked(buildBatchMoveDestinationTree).mockClear();
  });

  it('builds the batch destination tree once while the selection and library are unchanged', () => {
    const view = renderWithLocalization(<Sheet busy={false} />);
    expect(buildBatchMoveDestinationTree).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 5; index += 1) view.rerender(<Sheet busy={index % 2 === 0} />);
    expect(buildBatchMoveDestinationTree).toHaveBeenCalledTimes(1);
  });
});
