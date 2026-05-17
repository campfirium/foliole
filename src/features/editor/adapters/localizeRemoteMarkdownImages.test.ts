import { beforeEach, describe, expect, it, vi } from 'vitest';

const { importRemoteImageAttachment } = vi.hoisted(() => ({
  importRemoteImageAttachment: vi.fn()
}));

vi.mock('../../../shared/platform/remoteImageLocalization', () => ({
  importRemoteImageAttachment
}));

import { localizeRemoteMarkdownImages } from './localizeRemoteMarkdownImages';

describe('localizeRemoteMarkdownImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rewrites remote markdown images to local asset links', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages('node-1', 'Before ![Cover](https://example.com/cover.png) after')
    ).resolves.toBe('Before ![Cover](asset://hash-1.png) after');
  });

  it('moves localized large remote images out of inline text', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      intrinsic_size: { height: 960, width: 1280 },
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages('node-1', 'Before ![Cover](https://example.com/cover.png) after')
    ).resolves.toBe('Before\n\n![Cover](asset://hash-1.png)\n\nafter');
  });

  it('does not add spacing when a localized large remote image already occupies a line', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      intrinsic_size: { height: 960, width: 1280 },
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages('node-1', 'Before\n\n![Cover](https://example.com/cover.png)\n\nafter')
    ).resolves.toBe('Before\n\n![Cover](asset://hash-1.png)\n\nafter');
  });
});

describe('localizeRemoteMarkdownImages failures and parser coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the original markdown when download fails', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'error',
      error_code: 'download_failed'
    });

    await expect(
      localizeRemoteMarkdownImages('node-1', '![Cover](https://example.com/cover.png)')
    ).resolves.toBe('![Cover](https://example.com/cover.png)');
  });

  it('downloads each remote source only once per pass', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '![A](https://example.com/cover.png)\n![B](https://example.com/cover.png)'
      )
    ).resolves.toBe('![A](asset://hash-1.png)\n![B](asset://hash-1.png)');

    expect(importRemoteImageAttachment).toHaveBeenCalledTimes(1);
  });

  it('rewrites parser-backed image targets with angle brackets, titles, and nested parentheses', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages('node-1', '![Cover](<https://example.com/gallery/(cover).png> "Title")')
    ).resolves.toBe('![Cover](asset://hash-1.png "Title")');

    expect(importRemoteImageAttachment).toHaveBeenCalledWith('node-1', 'https://example.com/gallery/(cover).png');
  });
});
