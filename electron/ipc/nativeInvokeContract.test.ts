// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';

import { handleInvokeRequest } from './commands.js';

const mockWindow = {};

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getFocusedWindow: vi.fn(() => mockWindow)
  },
  app: {
    exit: vi.fn(),
    getVersion: vi.fn(() => '1.0.0'),
    relaunch: vi.fn()
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn()
  }
}));

vi.mock('../database/workspaceNodeDocument.js', () => ({
  loadWorkspaceNodeDocument: vi.fn()
}));

describe('native invoke contract dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches typed renderer requests through the unified Electron command handler', async () => {
    vi.mocked(loadWorkspaceNodeDocument).mockReturnValue({
      content: '# Node',
      hideTitleHeading: false,
      imageRegions: [],
      kind: 'topic',
      nodeId: 'node-1',
      reveal: null,
      updatedAt: '2026-04-27T00:00:00.000Z',
      virtualFilter: null
    });

    await expect(
      handleInvokeRequest({
        command: NATIVE_COMMANDS.loadNodeDocument,
        args: { nodeId: 'node-1' }
      })
    ).resolves.toMatchObject({ nodeId: 'node-1' });

    expect(loadWorkspaceNodeDocument).toHaveBeenCalledWith('node-1');
  });

  it('fails clearly for unsupported commands and invalid payloads', async () => {
    await expect(handleInvokeRequest({ command: 'missing_command' })).rejects.toThrow(
      'unsupported native command: missing_command'
    );
    await expect(
      handleInvokeRequest({
        command: NATIVE_COMMANDS.loadNodeDocument,
        args: {}
      })
    ).rejects.toThrow('invalid argument: nodeId');
  });
});
