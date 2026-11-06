import { afterEach, expect, it } from 'vitest';

import { runWorkspaceContentCommand, waitForWorkspaceContentCommands } from './workspaceContentCommands';
import { useWorkspaceStore } from './workspaceStore';
import { createWorkspaceNodeActionsFixture } from './workspaceStoreNodeActions.test-support';

const original = useWorkspaceStore.getState();
afterEach(() => useWorkspaceStore.setState(original, true));

it('keeps command completion local to its original library and document', async () => {
  useWorkspaceStore.setState({ ...createWorkspaceNodeActionsFixture(), libraryScope: 'first-library', activeNodeId: 'node-1' });
  let release!: (result: boolean) => void;
  const command = new Promise<boolean>(resolve => { release = resolve; });
  expect(runWorkspaceContentCommand(() => command)).toBe(command);
  let originalFinished = false;
  const finishing = waitForWorkspaceContentCommands('first-library', 'node-1').then(result => {
    originalFinished = true;
    return result;
  });
  useWorkspaceStore.setState({ libraryScope: 'second-library', activeNodeId: 'node-1' });
  expect(await waitForWorkspaceContentCommands('second-library', 'node-1')).toBe(true);
  expect(await waitForWorkspaceContentCommands('first-library', 'other-topic')).toBe(true);
  expect(originalFinished).toBe(false);
  release(true);
  expect(await finishing).toBe(true);
  expect(runWorkspaceContentCommand(() => false)).toBe(false);
});
