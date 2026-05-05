// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

it('ignores non-path clipboard text with malformed URI escapes', async () => {
  clipboard.readText.mockReturnValue('Large copied note with 100% pending content');

  await expect(collectClipboardFilePaths()).resolves.toEqual([]);
});

it('only decodes file URI text candidates during text path detection', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-clipboard-path-'));
  const filePath = path.join(tempDir, 'space name.txt');
  await fs.writeFile(filePath, 'body');
  clipboard.readText.mockReturnValue(`file://${filePath.replace('space name', 'space%20name')}`);

  await expect(collectClipboardFilePaths()).resolves.toEqual([filePath]);
  await fs.rm(tempDir, { force: true, recursive: true });
});

it('ignores malformed file URI text candidates', async () => {
  clipboard.readText.mockReturnValue('file:%20');

  await expect(collectClipboardFilePaths()).resolves.toEqual([]);
});
