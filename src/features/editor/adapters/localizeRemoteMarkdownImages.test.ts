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

  it('joins consecutive localized small remote images into one inline run', async () => {
    importRemoteImageAttachment.mockImplementation(async (_nodeId: string, sourceUrl: string) => ({
      status: 'imported',
      attachment_id: sourceUrl.includes('up') ? 'hash-up' : sourceUrl.includes('dots') ? 'hash-dots' : 'hash-down',
      intrinsic_size: { height: 64, width: 64 },
      original_name: 'icon.png'
    }));

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '![Up](https://example.com/up.png)\n![Dots](https://example.com/dots.png)\n![Down](https://example.com/down.png)'
      )
    ).resolves.toBe('![Up](asset://hash-up.png) ![Dots](asset://hash-dots.png) ![Down](asset://hash-down.png)');
  });
});

describe('localizeRemoteMarkdownImages wrapped links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves image-only wrapping links when localizing remote images', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '[\n\n![](https://blogger.googleusercontent.com/img/a/cover)\n\n](https://blogger.googleusercontent.com/img/a/cover)'
      )
    ).resolves.toBe('[![](asset://hash-1.png)](https://blogger.googleusercontent.com/img/a/cover)');
  });

  it('keeps large wrapped remote images as clean standalone blocks before following text', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      intrinsic_size: { height: 816, width: 1456 },
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '[\n\n![](https://blogger.googleusercontent.com/img/a/cover)\n\n](https://blogger.googleusercontent.com/img/a/cover)正文'
      )
    ).resolves.toBe('[![](asset://hash-1.png)](https://blogger.googleusercontent.com/img/a/cover)\n\n正文');
  });

  it('keeps stale remote image wrapping links around already localized images', async () => {
    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '[\n\n![image](asset://hash-1.png)\n\nimage1971×1242 140 KB](https://cdn.example.com/uploads/original/2X/f/cover.png)\n正文'
      )
    ).resolves.toBe('[![image1971×1242 140 KB](asset://hash-1.png)](https://cdn.example.com/uploads/original/2X/f/cover.png)\n正文');

    expect(importRemoteImageAttachment).not.toHaveBeenCalled();
  });

  it('uses the remote image wrapping link caption as the localized image alt text', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      intrinsic_size: { height: 816, width: 1456 },
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '[\n\n![image](https://cdn.example.com/uploads/original/2X/f/cover.png)\n\nimage1971×1242 140 KB](https://cdn.example.com/uploads/original/2X/f/cover.png)正文'
      )
    ).resolves.toBe('[![image1971×1242 140 KB](asset://hash-1.png)](https://cdn.example.com/uploads/original/2X/f/cover.png)\n\n正文');
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
