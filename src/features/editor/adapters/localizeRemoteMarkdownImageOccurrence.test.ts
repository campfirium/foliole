import { beforeEach, describe, expect, it, vi } from 'vitest';

const { importRemoteImageAttachment } = vi.hoisted(() => ({
  importRemoteImageAttachment: vi.fn()
}));

vi.mock('../../../shared/platform/remoteImageLocalization', () => ({
  importRemoteImageAttachment: (...args: unknown[]) => importRemoteImageAttachment(...args)
}));

import { localizeRemoteMarkdownImageOccurrence } from './localizeRemoteMarkdownImages';

const IMAGE_HASH = 'a'.repeat(64);
const IMAGE_URL = `asset://${IMAGE_HASH}.png`;

describe('localizeRemoteMarkdownImageOccurrence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('localizes only the explicitly targeted remote image', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported', attachment_id: 'attachment-1', hash: IMAGE_HASH,
      mime_type: 'image/png', original_name: 'cover.png', storage_key: `${IMAGE_HASH}.png`
    });
    const first = '![First](https://example.com/first.png)';
    const second = '![Second](https://example.com/second.png)';
    const markdown = `${first}\n${second}`;

    await expect(localizeRemoteMarkdownImageOccurrence('node-1', markdown, {
      from: first.length + 1,
      source: 'https://example.com/second.png',
      to: markdown.length
    })).resolves.toEqual({
      attachmentId: 'attachment-1',
      content: `${first}\n![Second](${IMAGE_URL})`
    });
    expect(importRemoteImageAttachment).toHaveBeenCalledOnce();
    expect(importRemoteImageAttachment).toHaveBeenCalledWith('node-1', 'https://example.com/second.png');
  });

  it('returns no edit when the targeted import fails', async () => {
    importRemoteImageAttachment.mockResolvedValue({ status: 'error', error_code: 'download_failed' });
    const markdown = '![Cover](https://example.com/cover.png)';

    await expect(localizeRemoteMarkdownImageOccurrence('node-1', markdown, {
      from: 0,
      source: 'https://example.com/cover.png',
      to: markdown.length
    })).resolves.toBeNull();
  });
});
