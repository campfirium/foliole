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
