import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  confirmReconnect: vi.fn(),
  preview: vi.fn(),
  previewReconnect: vi.fn(),
  requestConfirmation: vi.fn(),
  selectFolder: vi.fn()
}));

vi.mock('../../shared/platform/folderSelectionRuntimeRepository', () => ({ selectRuntimeFolder: mocks.selectFolder }));
vi.mock('../../shared/platform/import/watchedFolderRuntimeRepository', () => ({
  confirmWatchedFolderReconnectInRuntime: mocks.confirmReconnect,
  previewWatchedFolderReconnectInRuntime: mocks.previewReconnect
}));
vi.mock('../../shared/platform/desktop/sourceManagementRepository', () => ({
  confirmSourceManagement: mocks.confirm,
  previewSourceManagement: mocks.preview
}));
vi.mock('../../shared/ui', () => ({ requestAppConfirmation: mocks.requestConfirmation }));

import { removeWatchedSource } from './watchedSourceManagementActions';

const t = (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue({
    source_count: 2,
    sources: [{ root_path: '/old/a' }, { root_path: '/old/b' }],
    topic_count: 3
  });
});

it('leaves watched Source data unchanged when removal is cancelled after preview', async () => {
  mocks.requestConfirmation.mockResolvedValue(false);

  await removeWatchedSource('watched:a', vi.fn(), t as never);

  expect(mocks.preview).toHaveBeenCalledWith({ action: 'remove_source', sourceRef: 'watched:a' });
  expect(mocks.confirm).not.toHaveBeenCalled();
});
