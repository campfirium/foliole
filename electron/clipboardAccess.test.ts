// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { ClipboardItem, clipboard, nativeImage } = vi.hoisted(() => {
  class TestClipboardItem {
    readonly data: Record<string, unknown>;
    readonly types: string[];

    constructor(data: Record<string, unknown>) {
      this.data = data;
      this.types = Object.keys(data);
    }

    async getType(type: string) {
      return this.data[type];
    }
  }

  const empty = { isEmpty: vi.fn(() => true), toPNG: vi.fn(() => Buffer.alloc(0)) };
  return {
    ClipboardItem: TestClipboardItem,
    clipboard: {
      clear: vi.fn(),
      read: vi.fn(async () => [] as TestClipboardItem[]),
      readText: vi.fn(() => ''),
      write: vi.fn(async (items: TestClipboardItem[]) => {
        void items;
      })
    },
    nativeImage: {
      createEmpty: vi.fn(() => empty),
      createFromBuffer: vi.fn((bytes: Buffer) => ({ bytes, isEmpty: () => false }))
    }
  };
});

vi.mock('electron', () => ({ ClipboardItem, clipboard, nativeImage }));

import { electronClipboardAccess } from './clipboardAccess.js';

beforeEach(() => {
  vi.clearAllMocks();
  clipboard.read.mockResolvedValue([]);
  clipboard.readText.mockReturnValue('');
});

it('maps Electron raw clipboard MIME types back to native format names', async () => {
  const rawType = 'electron application/osclipboard;format="FileNameW"';
  clipboard.read.mockResolvedValue([
    new ClipboardItem({ [rawType]: new Blob([Uint8Array.from([1, 2, 3])]) })
  ]);

  await expect(electronClipboardAccess.availableFormats()).resolves.toEqual(['FileNameW']);
  await expect(electronClipboardAccess.readBuffer('FileNameW')).resolves.toEqual(Buffer.from([1, 2, 3]));
});

it('reads text, HTML, bookmark, and image through the Electron 44 item model', async () => {
  const imageBytes = Uint8Array.from([4, 5, 6]);
  clipboard.readText.mockReturnValue('plain');
  clipboard.read.mockResolvedValue([
    new ClipboardItem({
      'electron application/bookmark': { title: 'Foliole', url: 'https://foliole.app' },
      'image/png': new Blob([imageBytes]),
      'text/html': new Blob(['<strong>rich</strong>'])
    })
  ]);

  expect(await electronClipboardAccess.readText()).toBe('plain');
  await expect(electronClipboardAccess.readHTML()).resolves.toBe('<strong>rich</strong>');
  await expect(electronClipboardAccess.readBookmark()).resolves.toEqual({
    title: 'Foliole',
    url: 'https://foliole.app'
  });
  await expect(electronClipboardAccess.readImage()).resolves.toEqual(
    expect.objectContaining({ bytes: Buffer.from(imageBytes) })
  );
});

it('writes all restorable clipboard representations atomically', async () => {
  const image = { isEmpty: () => false, toPNG: () => Buffer.from([7, 8, 9]) };

  await electronClipboardAccess.write({
    bookmark: 'Foliole',
    html: '<strong>rich</strong>',
    image: image as never,
    rtf: '{\\rtf1 rich}',
    text: 'plain'
  });

  expect(clipboard.write).toHaveBeenCalledTimes(1);
  const [item] = clipboard.write.mock.calls[0]?.[0] ?? [];
  expect(item?.types).toEqual([
    'text/plain',
    'text/html',
    'text/rtf',
    'electron application/bookmark',
    'image/png'
  ]);
  expect(item?.data['electron application/bookmark']).toEqual({ title: 'Foliole', url: 'plain' });
  await expect((item?.data['image/png'] as Blob).arrayBuffer()).resolves.toEqual(
    Uint8Array.from([7, 8, 9]).buffer
  );
});
