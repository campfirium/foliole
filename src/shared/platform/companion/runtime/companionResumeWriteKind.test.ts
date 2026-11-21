import { expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as unknown[]);
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ isAvailableNativeCompanionRuntime: () => true }));
vi.mock('./iosCompanionActiveDatabase', () => ({
  readIosCompanionDatabase: vi.fn(),
  writeIosCompanionDatabase: async (task: (db: { run: () => Promise<void> }) => Promise<void>, write: unknown) => {
    writes.push(write);
    await task({ run: async () => undefined });
  }
}));

import { saveCompanionFlowResume } from './companionFlowResume';
import { saveCompanionNavigationResume } from './companionNavigationResume';

it('saves navigation and flow resume positions as device-local writes that never stale the folder backup', async () => {
  await saveCompanionNavigationResume('library', '{}');
  await saveCompanionFlowResume('library', 'node');
  expect(writes).toEqual([{ kind: 'device-local' }, { kind: 'device-local' }]);
});
