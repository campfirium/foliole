import { expect, it, vi } from 'vitest';

const importSourcePrewarmMocks = vi.hoisted(() => ({
  loadDetailsModule: vi.fn()
}));

vi.mock('./ImportSourceWorkspaceDetails', () => {
  importSourcePrewarmMocks.loadDetailsModule();
  return {
    ImportSourceWorkspaceDetails: () => null
  };
});

it('prewarms lazy import source workspace details once after startup', async () => {
  const { prewarmImportSourceWorkspace } = await import('./ImportSourceWorkspace');

  await prewarmImportSourceWorkspace();
  await prewarmImportSourceWorkspace();

  expect(importSourcePrewarmMocks.loadDetailsModule).toHaveBeenCalledTimes(1);
});
