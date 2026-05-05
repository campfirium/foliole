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

  await expect(copyAttachmentImageToClipboard('hash-1')).resolves.toEqual({ status: 'copied' });
  expect(invoke).toHaveBeenCalledWith('copy_attachment_image_to_clipboard', { attachment_id: 'hash-1' });
});

it('exports attachment images through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({ status: 'saved', path: '/tmp/cover.png' });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(exportAttachmentImage('hash-2')).resolves.toEqual({ status: 'saved', path: '/tmp/cover.png' });
  expect(invoke).toHaveBeenCalledWith('export_attachment_image', { attachment_id: 'hash-2' });
});
