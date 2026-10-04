import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';

import { CompanionDirectoryContent } from './CompanionDirectoryContent';
import { CompanionNextTopicFooter } from './CompanionNextTopicFooter';
import { CompanionReadingActivity } from './companionReadingActivity';
import { useCompanionDirectoryReadingSequence } from './useCompanionDirectoryReadingSequence';

vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

function topic(id: string, openedAt: string): WorkspaceSnapshot['nodesById'][string] {
  return {
    anchorLink: null, content: `# ${id}`, createdAt: '2026-01-01', hideTitleHeading: false,
    id, isTitleManual: true, kind: 'topic', parentNodeId: 'folder', reading: null,
    reveal: null, review: null, title: id, updatedAt: openedAt
  };
}

const initialSnapshot: WorkspaceSnapshot = {
  activeNodeId: null,
  nodeOrder: ['folder', 'A', 'B', 'C'],
  nodesById: {
    folder: { ...topic('folder', '2026-01-01'), kind: 'folder', parentNodeId: null },
    A: topic('A', '2026-01-03'),
    B: topic('B', '2026-01-02'),
    C: topic('C', '2026-01-01')
  },
  nodeOpenStateById: {
    A: { nodeId: 'A', lastOpenedAt: '2026-01-03T00:00:00.000Z' },
    B: { nodeId: 'B', lastOpenedAt: '2026-01-02T00:00:00.000Z' },
    C: { nodeId: 'C', lastOpenedAt: '2026-01-01T00:00:00.000Z' }
  },
  trashedNodeIds: [], untitledSequenceByParent: {}
};

function DirectoryReadingHarness() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selection = { kind: 'internal' as const, nodeId: 'folder' };
  const sequence = useCompanionDirectoryReadingSequence({ selection, selectedNodeId: selectedId, snapshot });
  const nextTopicNodeId = sequence.nextTopicNodeId;

  function open(nodeId: string) {
    setSelectedId(nodeId);
    setSnapshot((current) => ({
      ...current,
      nodeOpenStateById: {
        ...current.nodeOpenStateById,
        [nodeId]: { nodeId, lastOpenedAt: `2026-01-0${4 + ['A', 'B', 'C'].indexOf(nodeId)}T00:00:00.000Z` }
      }
    }));
  }

  return selectedId ? <>
    <article>{selectedId} body</article>
    {nextTopicNodeId ? <CompanionNextTopicFooter activity={new CompanionReadingActivity(selectedId, () => undefined)}
      onOpen={() => open(nextTopicNodeId)} /> : null}
    <button onClick={() => setSelectedId(null)} type="button">Exit</button>
  </> : <CompanionDirectoryContent
    onChangeSelection={vi.fn()} onExitArticle={vi.fn()}
    onSelectNode={(nodeId, order) => { sequence.capture(nodeId, order); open(nodeId); }}
    selection={selection} snapshot={snapshot} sortDirection="desc" sortKey="dateLastOpened"
  />;
}

it('continues through the opened directory order without a previous control or a changed-order repeat', async () => {
  render(<LocalizationProvider initialLanguagePreference="en"><DirectoryReadingHarness /></LocalizationProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Open topic A' }));
  expect(screen.getByText('A body')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Previous topic/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next topic' })).not.toHaveTextContent('B');
  fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
  expect(await screen.findByText('B body')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
  expect(await screen.findByText('C body')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Next topic/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  expect(screen.getByRole('button', { name: 'Open topic B' })).toBeInTheDocument();
});

it('keeps the current topic open when a pending edit cannot be saved', async () => {
  const activity = new CompanionReadingActivity('A', () => undefined);
  activity.flushDraft = vi.fn().mockRejectedValueOnce(new Error('save failed'));
  const open = vi.fn();
  render(<LocalizationProvider initialLanguagePreference="en">
    <CompanionNextTopicFooter activity={activity} onOpen={open} />
  </LocalizationProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Finish or retry the current change');
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
});

it('does not reopen the next topic after the reader was exited during a save', async () => {
  const activity = new CompanionReadingActivity('A', () => undefined);
  let finishSave: (() => void) | undefined;
  activity.flushDraft = () => new Promise<void>((resolve) => { finishSave = resolve; });
  const open = vi.fn();
  const view = render(<LocalizationProvider initialLanguagePreference="en">
    <CompanionNextTopicFooter activity={activity} onOpen={open} />
  </LocalizationProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
  await waitFor(() => expect(finishSave).toBeDefined());
  view.unmount();
  finishSave?.();
  await Promise.resolve();
  expect(open).not.toHaveBeenCalled();
});
