import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive';

import { CompanionDiveFlowChoice } from './CompanionDiveFlowChoice';

function folder(id: string, title: string): WorkspaceSnapshot['nodesById'][string] {
  return {
    id, title, kind: 'folder', parentNodeId: null, content: '', reveal: null, reading: null, review: null,
    anchorLink: null, isTitleManual: true, hideTitleHeading: false, createdAt: '2026-01-01', updatedAt: '2026-01-01'
  };
}

const snapshot: WorkspaceSnapshot = {
  nodesById: {
    first: { ...folder('first', 'History'), virtualFilter: DIVE_NODE_FILTER },
    second: { ...folder('second', 'Physics'), virtualFilter: DIVE_NODE_FILTER },
    notes: folder('notes', 'Notes')
  },
  nodeOrder: ['first', 'second', 'notes'],
  activeNodeId: null,
  trashedNodeIds: [],
  untitledSequenceByParent: {}
};

function renderCheckpoint() {
  const openDiveFlow = vi.fn();
  const handleTabAction = vi.fn();
  render(<CompanionDiveFlowChoice snapshot={snapshot} surface={{ openDiveFlow, handleTabAction, flowError: null }}
    dive={{ id: 'first', topicIds: [], phase: 'today', mode: 'recommended', stop: 'waiting',
      hasWork: false, limit: 0, position: 0 }} />);
  return { openDiveFlow, handleTabAction };
}

it('opens a dedicated picker with every Dive and preserves the current checkpoint when dismissed', () => {
  const { openDiveFlow } = renderCheckpoint();
  const trigger = screen.getByRole('button', { name: 'Switch' });
  fireEvent.click(trigger);
  const picker = screen.getByRole('dialog', { name: 'Choose a Dive' });
  const current = within(picker).getByRole('button', { name: 'History' });
  expect(current).toHaveAttribute('aria-current', 'true');
  expect(within(picker).queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument();
  fireEvent.click(current);
  expect(openDiveFlow).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(openDiveFlow).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Physics' }));
  expect(openDiveFlow).toHaveBeenCalledExactlyOnceWith({ id: 'second', topicIds: [] });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('separates the checkpoint status from the Flow actions with four buttons even while waiting', () => {
  const { openDiveFlow, handleTabAction } = renderCheckpoint();
  const actions = screen.getByRole('group', { name: 'Workspace study actions' });
  expect(screen.getByRole('heading', { name: 'Dive Clear for Now' })).toBeVisible();
  expect(within(actions).queryByRole('heading')).not.toBeInTheDocument();
  expect(within(actions).getAllByRole('button')).toHaveLength(4);
  fireEvent.click(within(actions).getByRole('button', { name: 'Continue' }));
  fireEvent.click(within(actions).getByRole('button', { name: 'Global' }));
  fireEvent.click(within(actions).getByRole('button', { name: 'Exit' }));
  expect(openDiveFlow.mock.calls).toEqual([
    [{ id: 'first', topicIds: [] }, 'continue'], [null]
  ]);
  expect(handleTabAction).toHaveBeenCalledExactlyOnceWith('recent');
});
