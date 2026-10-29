// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

const mocks = vi.hoisted(() => ({ read: vi.fn(), driver: {} }));
vi.mock('../../lib/core/database/workspaceNodeLearning.js', () => ({ readWorkspaceNodeLearning: mocks.read }));
vi.mock('../database/attachmentResourceDescription.js', () => ({ currentLibraryScope: () => 'library-a' }));
vi.mock('../database/connection.js', async importOriginal => ({
  ...await importOriginal<typeof import('../database/connection.js')>(),
  openDatabaseConnection: () => ({ driver: mocks.driver })
}));

import { handleWorkspaceReadCommand } from './storageReadCommands.js';

beforeEach(() => vi.clearAllMocks());
it('returns only the requested library learning facts through the read bridge', () => {
  const facts = [{ nodeId: 'a', reading: null, review: null }];
  mocks.read.mockReturnValue(facts);
  expect(handleWorkspaceReadCommand(NATIVE_COMMANDS.loadNodeLearning, { nodeIds: ['a'], libraryScope: 'library-a' })).toEqual(facts);
  expect(mocks.read).toHaveBeenCalledWith(mocks.driver, ['a']);
});
it('rejects another library and malformed node IDs before reading facts', () => {
  expect(() => handleWorkspaceReadCommand(NATIVE_COMMANDS.loadNodeLearning,
    { nodeIds: ['a'], libraryScope: 'library-b' })).toThrow('workspace_learning_library_changed');
  expect(() => handleWorkspaceReadCommand(NATIVE_COMMANDS.loadNodeLearning,
    { nodeIds: [42], libraryScope: 'library-a' })).toThrow();
  expect(mocks.read).not.toHaveBeenCalled();
});
