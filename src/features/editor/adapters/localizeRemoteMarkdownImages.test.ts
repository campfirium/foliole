import { beforeEach, describe, expect, it, vi } from 'vitest';

const { importRemoteImageAttachment } = vi.hoisted(() => ({
  importRemoteImageAttachment: vi.fn()
}));

vi.mock('../../../shared/platform/remoteImageLocalization', () => ({
  importRemoteImageAttachment
}));

import { localizeRemoteMarkdownImages } from './localizeRemoteMarkdownImages';

const IMAGE_HASH = 'a'.repeat(64);
const IMAGE_URL = `asset://${IMAGE_HASH}.png`;

function createSmallImportedImage(sourceUrl: string) {
  const hash = (sourceUrl.includes('up') ? 'b' : sourceUrl.includes('dots') ? 'c' : 'd').repeat(64);
  return {
    status: 'imported',
    attachment_id: `attachment-${hash[0]}`,
    hash,
    mime_type: 'image/png',
    intrinsic_size: { height: 64, width: 64 },
    original_name: 'icon.png'
  };
}

describe('localizeRemoteMarkdownImages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rewrites remote markdown images to local asset links', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'attachment-1',
      hash: IMAGE_HASH,
      mime_type: 'image/png',
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages('node-1', 'Before ![Cover](https://example.com/cover.png) after')
    ).resolves.toBe(`Before ![Cover](${IMAGE_URL}) after`);
  });

  it('moves localized large remote images out of inline text', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'attachment-1',
      hash: IMAGE_HASH,
      mime_type: 'image/png',
      intrinsic_size: { height: 960, width: 1280 },
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages('node-1', 'Before ![Cover](https://example.com/cover.png) after')
    ).resolves.toBe(`Before\n\n![Cover](${IMAGE_URL})\n\nafter`);
  });

  it('does not add spacing when a localized large remote image already occupies a line', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'attachment-1',
      hash: IMAGE_HASH,
      mime_type: 'image/png',
      intrinsic_size: { height: 960, width: 1280 },
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages('node-1', 'Before\n\n![Cover](https://example.com/cover.png)\n\nafter')
    ).resolves.toBe(`Before\n\n![Cover](${IMAGE_URL})\n\nafter`);
  });

  it('joins consecutive localized small remote images into one inline run', async () => {
    importRemoteImageAttachment.mockImplementation(
      async (_nodeId: string, sourceUrl: string) => createSmallImportedImage(sourceUrl)
    );

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '![Up](https://example.com/up.png)\n![Dots](https://example.com/dots.png)\n![Down](https://example.com/down.png)'
      )
    ).resolves.toBe(
      `![Up](asset://${'b'.repeat(64)}.png) ![Dots](asset://${'c'.repeat(64)}.png) ![Down](asset://${'d'.repeat(64)}.png)`
    );
  });
});

describe('localizeRemoteMarkdownImages wrapped links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves image-only wrapping links when localizing remote images', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'attachment-1',
      hash: IMAGE_HASH,
      mime_type: 'image/png',
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '[\n\n![](https://blogger.googleusercontent.com/img/a/cover)\n\n](https://blogger.googleusercontent.com/img/a/cover)'
      )
    ).resolves.toBe(`[![](${IMAGE_URL})](https://blogger.googleusercontent.com/img/a/cover)`);
  });

  it('keeps large wrapped remote images as clean standalone blocks before following text', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'attachment-1',
      hash: IMAGE_HASH,
      mime_type: 'image/png',
      intrinsic_size: { height: 816, width: 1456 },
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '[\n\n![](https://blogger.googleusercontent.com/img/a/cover)\n\n](https://blogger.googleusercontent.com/img/a/cover)正文'
      )
    ).resolves.toBe(`[![](${IMAGE_URL})](https://blogger.googleusercontent.com/img/a/cover)\n\n正文`);
  });

  it('keeps stale remote image wrapping links around already localized images', async () => {
    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        `[\n\n![image](${IMAGE_URL})\n\nimage1971×1242 140 KB](https://cdn.example.com/uploads/original/2X/f/cover.png)\n正文`
      )
    ).resolves.toBe(`[![image1971×1242 140 KB](${IMAGE_URL})](https://cdn.example.com/uploads/original/2X/f/cover.png)\n正文`);

    expect(importRemoteImageAttachment).not.toHaveBeenCalled();
  });

  it('uses the remote image wrapping link caption as the localized image alt text', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'attachment-1',
      hash: IMAGE_HASH,
      mime_type: 'image/png',
      intrinsic_size: { height: 816, width: 1456 },
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '[\n\n![image](https://cdn.example.com/uploads/original/2X/f/cover.png)\n\nimage1971×1242 140 KB](https://cdn.example.com/uploads/original/2X/f/cover.png)正文'
      )
    ).resolves.toBe(`[![image1971×1242 140 KB](${IMAGE_URL})](https://cdn.example.com/uploads/original/2X/f/cover.png)\n\n正文`);
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
      attachment_id: 'attachment-1',
      hash: IMAGE_HASH,
      mime_type: 'image/png',
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages(
        'node-1',
        '![A](https://example.com/cover.png)\n![B](https://example.com/cover.png)'
      )
    ).resolves.toBe(`![A](${IMAGE_URL})\n![B](${IMAGE_URL})`);

    expect(importRemoteImageAttachment).toHaveBeenCalledTimes(1);
  });

  it('rewrites parser-backed image targets with angle brackets, titles, and nested parentheses', async () => {
    importRemoteImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'attachment-1',
      hash: IMAGE_HASH,
      mime_type: 'image/png',
      original_name: 'cover.png'
    });

    await expect(
      localizeRemoteMarkdownImages('node-1', '![Cover](<https://example.com/gallery/(cover).png> "Title")')
    ).resolves.toBe(`![Cover](${IMAGE_URL} "Title")`);

    expect(importRemoteImageAttachment).toHaveBeenCalledWith('node-1', 'https://example.com/gallery/(cover).png');
  });
});
