import { beforeEach, expect, it, vi } from 'vitest';

import { copyAttachmentImageToClipboard, exportAttachmentImage } from './attachmentImageActions';
import { getRuntimeInvoke } from './runtimeInvoke';

vi.mock('./runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
});

it('copies attachment images through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({ status: 'copied' });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(copyAttachmentImageToClipboard(`${'a'.repeat(64)}.png`)).resolves.toEqual({ status: 'copied' });
  expect(invoke).toHaveBeenCalledWith('copy_attachment_image_to_clipboard', { storage_key: `${'a'.repeat(64)}.png` });
});

it('exports attachment images through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({ status: 'saved', path: '/tmp/cover.png' });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(exportAttachmentImage(`${'b'.repeat(64)}.jpg`)).resolves.toEqual({ status: 'saved', path: '/tmp/cover.png' });
  expect(invoke).toHaveBeenCalledWith('export_attachment_image', { storage_key: `${'b'.repeat(64)}.jpg` });
});
