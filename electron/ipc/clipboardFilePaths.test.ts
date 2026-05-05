// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { clipboard } = vi.hoisted(() => ({
  clipboard: {
    availableFormats: vi.fn((): string[] => []),
    read: vi.fn(() => ''),
    readBuffer: vi.fn(() => Buffer.alloc(0)),
    readText: vi.fn(() => '')
  }
}));

vi.mock('electron', () => ({ clipboard }));

import { collectClipboardFilePaths, parseWindowsFileDropListPayload } from './clipboardFilePaths.js';

beforeEach(() => {
  vi.clearAllMocks();
  clipboard.availableFormats.mockReturnValue([]);
  clipboard.read.mockReturnValue('');
  clipboard.readBuffer.mockReturnValue(Buffer.alloc(0));
  clipboard.readText.mockReturnValue('');
});

it('parses Windows FileDropList JSON from the native clipboard fallback', () => {
  expect(parseWindowsFileDropListPayload('["C:\\\\Users\\\\me\\\\Desktop\\\\paper.pdf"]')).toEqual([
    'C:\\Users\\me\\Desktop\\paper.pdf'
  ]);
});

it('preserves non-ASCII paths from the Windows FileDropList fallback', () => {
  expect(parseWindowsFileDropListPayload('["C:\\\\Users\\\\me\\\\Desktop\\\\渐进阅读报告.pdf"]')).toEqual([
    'C:\\Users\\me\\Desktop\\渐进阅读报告.pdf'
  ]);
});

it('uses the Windows FileDropList fallback when Electron clipboard formats do not expose copied files', async () => {
  await expect(
    collectClipboardFilePaths({
      readWindowsFileDropList: async () => ['C:\\Users\\me\\Desktop\\paper.pdf']
    })
  ).resolves.toEqual(['C:\\Users\\me\\Desktop\\paper.pdf']);
});
