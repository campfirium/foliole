// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  dialog: vi.fn(), references: vi.fn(), description: vi.fn(), resolve: vi.fn()
}));
vi.mock('electron', () => ({ dialog: { showSaveDialog: fixture.dialog }, nativeImage: {} }));
vi.mock('../clipboardAccess.js', () => ({ electronClipboardAccess: {} }));
vi.mock('../database/attachmentResourceDescription.js', () => ({ loadAttachmentResourceDescription: fixture.description }));
vi.mock('../database/nodeResources.js', () => ({ loadNodeResourceReferences: fixture.references }));
vi.mock('./resourceResolver.js', () => ({ resolveAttachmentFile: fixture.resolve }));

import { exportAttachmentImage } from './attachmentImageActions.js';

const key = `${'a'.repeat(64)}.png`;
beforeEach(() => {
  vi.clearAllMocks();
  fixture.description.mockReturnValue({ attachmentId: 'a'.repeat(64), storageKey: key });
  fixture.resolve.mockReturnValue({ status: 'ready', filePath: `/library/Assets/${key}`, mimeType: 'image/png' });
  fixture.dialog.mockResolvedValue({ canceled: true });
  fixture.references.mockImplementation((nodeId: string) => [{
    storage_key: key, role: 'image', original_name: nodeId === 'first' ? 'First.png' : 'Second.png'
  }]);
});

it('exports shared bytes with the original name belonging to the selected article', async () => {
  await exportAttachmentImage(key, null, 'first');
  await exportAttachmentImage(key, null, 'second');
  expect(fixture.resolve).toHaveBeenCalledWith(key);
  expect(fixture.dialog.mock.calls.map(([options]) => options.defaultPath)).toEqual(['First.png', 'Second.png']);
});

it('uses the canonical filename when the article has no original-name descriptor', async () => {
  fixture.references.mockReturnValue([]);
  await exportAttachmentImage(key, null, 'first');
  expect(fixture.dialog).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: key }));
});
