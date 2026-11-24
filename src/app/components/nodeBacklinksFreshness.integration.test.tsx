import '../../test/nodeBacklinks.testSupport';

import { fireEvent, renderHook, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import { installBridge, mutate, panel, persisted, reader, save, saveVersioned, writer } from '../../test/nodeBacklinks.testSupport';

import { useNodeBacklinks } from './useNodeBacklinks';

it('updates two independent mounted panels after saved links, renames, deletion and restoration', async () => {
  const a = panel(writer), b = panel(reader);
  const views = [a, b];
  for (const view of views) await within(view.container).findByText('No topics link back to this topic yet.');
  await save('source', 'Source', 'First [[Target]] and [[Target]].');
  expect(persisted('source')?.content).toBe('First [[Target]] and [[Target]].');
  for (const view of views) {
    const button = await within(view.container).findByRole('button', { name: /Source.*First.*2/s });
    fireEvent.click(button); expect(view.select).toHaveBeenLastCalledWith('source');
    expect(view.container).toHaveTextContent('Found 1 topics');
  }
  await save('source', 'Renamed source', 'Updated [[Target]].');
  expect(persisted('source')?.title).toBe('Renamed source');
  for (const view of views) await within(view.container).findByRole('button', { name: /Renamed source.*Updated/s });
  await save('source', 'Renamed source', 'Removed link.');
  for (const view of views) await waitFor(() => expect(within(view.container).queryByRole('button')).toBeNull());
  await save('source', 'Renamed source', 'Added again [[Target]].');
  for (const view of views) await within(view.container).findByRole('button', { name: /Added again/ });
  await mutate('soft_delete_nodes', { nodeIds: ['source'], deletedAt: new Date().toISOString() });
  expect(persisted('source')?.deleted_at).not.toBeNull();
  for (const view of views) await waitFor(() => expect(within(view.container).queryByRole('button')).toBeNull());
  await mutate('restore_nodes', { nodeIds: ['source'] });
  expect(persisted('source')?.deleted_at).toBeNull();
  for (const view of views) await within(view.container).findByRole('button', { name: /Added again/ });
  await save('target', 'New target', 'Target body.', reader);
  expect(persisted('target')?.title).toBe('New target');
  for (const view of views) await waitFor(() => expect(within(view.container).queryByRole('button')).toBeNull());
  await save('source', 'Renamed source', 'Matches new [[New target]].');
  for (const view of views) await within(view.container).findByRole('button', { name: /Matches new/ });
  a.unmount(); b.unmount();
});

function watchTargetBacklinks() {
  return renderHook(() => useNodeBacklinks({ targetNodeId: 'target', nodeOrder: [],
    nodesById: {}, trashedNodeIds: [] }));
}

function recordBacklinkReads() {
  const invoke = installBridge(reader);
  return () => invoke.mock.calls.filter(([, request]) => request.command === 'load_node_backlinks');
}

it('shares a loaded lookup and a new link lookup across two views in the same window', async () => {
  const reads = recordBacklinkReads();
  const first = watchTargetBacklinks();
  await waitFor(() => expect(first.result.current.hasLoaded).toBe(true));
  const second = watchTargetBacklinks();
  await waitFor(() => expect(second.result.current.hasLoaded).toBe(true));
  expect(reads()).toHaveLength(1);

  await saveVersioned('source', 'Source', 'New [[Target]] reference.');
  for (const view of [first, second]) {
    await waitFor(() => expect(view.result.current.value).toEqual([
      { sourceNodeId: 'source', sourceTitle: 'Source', context: 'New [[Target]] reference.', matchCount: 1 }
    ]));
  }
  expect(reads()).toHaveLength(2);
});

it('skips ordinary saved text and refreshes when a backlink context actually changes', async () => {
  await saveVersioned('source', 'Source', 'First [[Target]] reference.');
  const reads = recordBacklinkReads();
  const view = watchTargetBacklinks();
  await waitFor(() => expect(view.result.current.value[0]?.context).toBe('First [[Target]] reference.'));
  expect(reads()).toHaveLength(1);

  await saveVersioned('target', 'Target', 'Ordinary body edit [[Source]].');
  await saveVersioned('source', 'Source', 'First [[Target]] reference.\n\nEdited paragraph.');
  expect(persisted('target')?.content).toBe('Ordinary body edit [[Source]].');
  expect(persisted('source')?.content).toContain('Edited paragraph.');
  expect(reads()).toHaveLength(1);

  await saveVersioned('source', 'Source', 'Changed context [[Target]].');
  await waitFor(() => expect(view.result.current.value[0]?.context).toBe('Changed context [[Target]].'));
  expect(reads()).toHaveLength(2);
});
