import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), preview: vi.fn(), requestConfirmation: vi.fn() }));

vi.mock('../../../shared/platform/desktop/sourceManagementRepository', () => ({
  confirmSourceManagement: mocks.confirm,
  previewSourceManagement: mocks.preview
}));
vi.mock('../../../shared/ui', () => ({ requestAppConfirmation: mocks.requestConfirmation }));

import { removeExternalSource, replaceExternalSourceHost } from './externalSourceManagement';

const t = (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue({ source_count: 1, sources: [{ root_path: '/old' }], topic_count: 4 });
});

it('does not confirm an External Source removal when the user cancels its impact preview', async () => {
  mocks.requestConfirmation.mockResolvedValue(false);

  await removeExternalSource('external:a', vi.fn(), t as never);

  expect(mocks.preview).toHaveBeenCalledWith({ action: 'remove_source', sourceRef: 'external:a' });
  expect(mocks.confirm).not.toHaveBeenCalled();
});

it('replaces an External Host only after confirmation and refreshes the persisted view', async () => {
  const refresh = vi.fn();
  mocks.requestConfirmation.mockResolvedValue(true);

  await replaceExternalSourceHost('Office PC', refresh, t as never);

  expect(mocks.confirm).toHaveBeenCalledWith({
    action: 'replace_host', hostName: 'Office PC', sourceType: 'external'
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});
