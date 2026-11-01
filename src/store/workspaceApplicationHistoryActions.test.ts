import { expect, it, vi } from 'vitest';

const apply = vi.hoisted(() => vi.fn());
vi.mock('./workspaceApplicationHistoryEntryApply', () => ({ applyApplicationHistoryEntry: apply }));

import { admitApplicationOperation, createApplicationHistory } from './workspaceApplicationHistory';
import { createApplicationHistoryActions } from './workspaceApplicationHistoryActions';
import { publishApplicationHistories } from './workspaceApplicationHistoryPublish';
import { projectApplicationWorkspaceHistory } from './workspaceApplicationWorkspaceHistory';
import { createWorkspaceNodeActionsFixture } from './workspaceStoreNodeActions.test-support';
import { createStructureRenameEntry } from './workspaceStructureHistoryEntries';

it('continues a new library while an old submitted replay waits, and isolates the late receipt', async () => {
  let state = createWorkspaceNodeActionsFixture();
  const set = (patch: Parameters<typeof publishApplicationHistories>[0] | ((value: typeof state) => Parameters<typeof publishApplicationHistories>[0])) => {
    state = { ...state, ...publishApplicationHistories(typeof patch === 'function' ? patch(state) : patch, state) };
    actions.wakeApplicationHistory();
  };
  const actions = createApplicationHistoryActions(set, () => state);
  const history = (id: string) => admitApplicationOperation(createApplicationHistory(), { id, ready: true, domain: 'workspace',
    entry: createStructureRenameEntry({ nodeId: 'node-1', beforeTitle: 'A', afterTitle: 'B', kind: 'topic' }) });
  set({ appActionHistory: projectApplicationWorkspaceHistory(state.appActionHistory, history('old')) });
  let release!: (value: unknown) => void;
  apply.mockImplementationOnce((input: { beforeSubmit: () => boolean }) => {
    input.beforeSubmit();
    return new Promise(resolve => { release = resolve; });
  });
  actions.undoApplicationOperation();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  set({ libraryScope: 'new' });
  set({ appActionHistory: projectApplicationWorkspaceHistory(state.appActionHistory, history('new')) });
  apply.mockImplementationOnce((input: { operation: unknown }) => input.operation);
  actions.undoApplicationOperation();
  await vi.waitFor(() => expect(state.appActionHistory.application?.redo.map(value => value.id)).toEqual(['new']));
  release({ id: 'old', domain: 'workspace' });
  await Promise.resolve();
  expect(state.appActionHistory.application?.redo.map(value => value.id)).toEqual(['new']);
  expect(state.appActionHistory.application?.requests).toEqual([]);
});
