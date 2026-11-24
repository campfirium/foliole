import { expect, it, vi } from 'vitest';

import { executePreload } from './preload.testSupport.js';

it('forwards ordinary content scopes through sandbox-limited require', () => {
  const { exposeInMainWorld, ipcOn } = executePreload();
  const handler = vi.fn();
  exposeInMainWorld.mock.calls[0]?.[1].onWorkspaceContentChanged(handler);
  const listener = ipcOn.mock.calls[0]?.[1];
  listener({}, { scope: 'workspace', libraryScope: 'library', ignored: true,
    workspaceScope: { kind: 'nodes', nodeIds: ['topic', 7], structure: true, ignored: true } });
  listener({}, { scope: 'workspace', libraryScope: 'library', workspaceScope: { kind: 'full' }, refreshWorkspace: false });
  expect(handler.mock.calls).toEqual([
    [{ scope: 'workspace', libraryScope: 'library', workspaceScope: { kind: 'nodes', nodeIds: ['topic'], structure: true } }],
    [{ scope: 'workspace', libraryScope: 'library', workspaceScope: { kind: 'full' }, refreshWorkspace: false }]
  ]);
});

it('preserves validated backlink impact for the committed source through the sandbox bridge', () => {
  const { exposeInMainWorld, ipcOn, sandboxRequire } = executePreload();
  const handler = vi.fn();
  exposeInMainWorld.mock.calls[0]?.[1].onWorkspaceContentChanged(handler);
  const listener = ipcOn.mock.calls[0]?.[1];
  const event = { scope: 'workspace', libraryScope: 'library', workspaceScope: { kind: 'nodes', nodeIds: ['topic'] } };

  listener({}, { ...event, backlinkSourceChange: { nodeId: 'topic', titleChanged: false,
    outgoingLinksChanged: true, extra: 'private' } });
  listener({}, { ...event, backlinkSourceChange: { nodeId: 'other', titleChanged: false, outgoingLinksChanged: false } });
  listener({}, { ...event, backlinkSourceChange: { nodeId: 'topic', titleChanged: 'false', outgoingLinksChanged: true } });

  expect(handler).toHaveBeenNthCalledWith(1, { ...event, backlinkSourceChange: {
    nodeId: 'topic', titleChanged: false, outgoingLinksChanged: true
  } });
  expect(handler).toHaveBeenNthCalledWith(2, event);
  expect(handler).toHaveBeenNthCalledWith(3, event);
  expect(sandboxRequire.mock.calls.every(([name]) => name === 'electron')).toBe(true);
});
