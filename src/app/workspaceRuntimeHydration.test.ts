import { expect, it, vi } from 'vitest';

const { ensureWorkspaceHydrated, loadRuntimeLibraryPathSettings } = vi.hoisted(() => ({
  ensureWorkspaceHydrated: vi.fn(),
  loadRuntimeLibraryPathSettings: vi.fn()
}));

vi.mock('../shared/platform/libraryPathsRuntimeRepository', () => ({ loadRuntimeLibraryPathSettings }));
vi.mock('../store/workspaceStoreHydration', () => ({ ensureWorkspaceHydrated }));

import { ensureWorkspaceRuntimeHydrated } from './workspaceRuntimeHydration';

it('hydrates library paths before the workspace becomes interactive', async () => {
  let finishPathHydration: (() => void) | undefined;
  loadRuntimeLibraryPathSettings.mockImplementation(() => new Promise<void>((resolve) => {
    finishPathHydration = resolve;
  }));
  ensureWorkspaceHydrated.mockResolvedValue(undefined);

  const hydration = ensureWorkspaceRuntimeHydrated();

  expect(loadRuntimeLibraryPathSettings).toHaveBeenCalledOnce();
  expect(ensureWorkspaceHydrated).not.toHaveBeenCalled();

  finishPathHydration?.();
  await hydration;

  expect(ensureWorkspaceHydrated).toHaveBeenCalledOnce();
});
