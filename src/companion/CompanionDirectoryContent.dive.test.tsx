import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionDirectoryContent, type CompanionDirectorySelection } from './CompanionDirectoryContent';

vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

function node(id: string, title: string, parentNodeId: string | null = null): WorkspaceSnapshot['nodesById'][string] {
  return {
    id, title, parentNodeId, kind: 'folder', content: '', isTitleManual: true, hideTitleHeading: false,
    reveal: null, anchorLink: null, reading: null, review: null, createdAt: '2026-11-09', updatedAt: '2026-11-09'
  };
}

function Directory({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const [selection, setSelection] = useState<CompanionDirectorySelection>({ kind: 'root' });
  return <CompanionDirectoryContent selection={selection} onChangeSelection={setSelection}
    onExitArticle={setSelection} onSelectNode={() => undefined} snapshot={snapshot}
    sortDirection="asc" sortKey="name" />;
}

it('opens the received Dive under Dives and shows its sources and derived topics', () => {
  const nodesById = {
    dive: { ...node('dive', 'Probability'), virtualFilter: DIVE_NODE_FILTER, manualChildOrder: ['source'] },
    source: node('source', 'Reference shelf'),
    member: { ...node('member', 'Statistics primer', 'source'), kind: 'topic' as const }
  };
  const snapshot: WorkspaceSnapshot = {
    nodesById, nodeOrder: Object.keys(nodesById), trashedNodeIds: [], activeNodeId: null, untitledSequenceByParent: {}
  };
  const view = renderWithLocalization(<Directory snapshot={snapshot} />);
  expect(screen.getByRole('heading', { name: 'Dives' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Open folder Probability' }));
  expect(screen.getByRole('heading', { name: 'Sources' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open folder Reference shelf' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Topics' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open topic Statistics primer' })).toBeVisible();

  view.rerender(<Directory snapshot={{ ...snapshot, nodesById: {
    ...nodesById, member: { ...nodesById.member, parentNodeId: null }
  } }} />);
  expect(screen.getByRole('button', { name: 'Open folder Reference shelf' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Open topic Statistics primer' })).toBeNull();
});
