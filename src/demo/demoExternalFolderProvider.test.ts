import { beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

import { canonicalGuidePath, DEFAULT_DEMO_TOPIC } from './demoContent';
import { createDemoExternalFolderProvider } from './demoExternalFolderProvider';
import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

type FakeHandle = FakeFileHandle | FakeDirectoryHandle;

class FakeFileHandle {
  kind = 'file' as const;

  constructor(public name: string, private file: File) {}

  getFile() {
    return Promise.resolve(this.file);
  }
}

class FakeDirectoryHandle {
  kind = 'directory' as const;

  constructor(public name: string, private items: [string, FakeHandle][]) {}

  async *entries() {
    for (const item of this.items) {
      yield item;
    }
  }
}

function createTextFile(name: string, content: string) {
  const file = new File([content], name, {
    lastModified: Date.parse('2026-06-20T00:00:00.000Z'),
    type: 'text/plain'
  });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  return file;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useWorkspaceStore.setState(createDemoWorkspaceSnapshot(canonicalGuidePath(DEFAULT_DEMO_TOPIC!.slug)));
});

it('indexes top-level markdown and text files while ignoring hidden, nested, and unsupported entries', async () => {
  const directory = new FakeDirectoryHandle('Samples', [
    ['guide.md', new FakeFileHandle('guide.md', createTextFile('guide.md', '# Guide\nBody'))],
    ['plain.txt', new FakeFileHandle('plain.txt', createTextFile('plain.txt', 'Plain text'))],
    ['image.png', new FakeFileHandle('image.png', createTextFile('image.png', 'png'))],
    ['.secret.md', new FakeFileHandle('.secret.md', createTextFile('.secret.md', 'hidden'))],
    ['nested', new FakeDirectoryHandle('nested', [])]
  ]);
  vi.stubGlobal('showDirectoryPicker', vi.fn(() => Promise.resolve(directory)));
  const provider = createDemoExternalFolderProvider();

  await expect(provider.selectFolderPath()).resolves.toBe('Samples');
  const folders = await provider.loadFolders();
  expect(folders).toHaveLength(1);
  expect(folders?.[0]).toMatchObject({ documentCount: 2, folderPath: 'Samples', status: 'ready' });
  const entries = await provider.loadBrowseEntries(folders![0]!.id);
  expect(entries?.map((entry) => entry.fileName)).toEqual(['guide.md', 'plain.txt']);
  expect(entries?.map((entry) => entry.title)).toEqual(['guide', 'plain']);
});

it('loads preview content through the synthetic locator', async () => {
  const directory = new FakeDirectoryHandle('Samples', [
    ['guide.md', new FakeFileHandle('guide.md', createTextFile('guide.md', '# Guide\nBody'))]
  ]);
  vi.stubGlobal('showDirectoryPicker', vi.fn(() => Promise.resolve(directory)));
  const provider = createDemoExternalFolderProvider();

  await provider.selectFolderPath();
  const folder = (await provider.loadFolders())![0]!;
  const entry = (await provider.loadBrowseEntries(folder.id))![0]!;
  const preview = await provider.loadPreview(entry.absolutePath);

  expect(preview).toMatchObject({
    absolutePath: entry.absolutePath,
    content: '# Guide\nBody',
    editable: false,
    extension: 'md',
    folderId: folder.id
  });
});

it('imports markdown and text files into the demo Inbox', async () => {
  const directory = new FakeDirectoryHandle('Samples', [
    ['plain.txt', new FakeFileHandle('plain.txt', createTextFile('plain.txt', 'Plain text'))]
  ]);
  vi.stubGlobal('showDirectoryPicker', vi.fn(() => Promise.resolve(directory)));
  const provider = createDemoExternalFolderProvider();

  await provider.selectFolderPath();
  const folder = (await provider.loadFolders())![0]!;
  const entry = (await provider.loadBrowseEntries(folder.id))![0]!;
  const result = await provider.importDocument(entry.absolutePath);

  expect(result?.node_id).toBeTruthy();
  const state = useWorkspaceStore.getState();
  const importedFolder = state.nodesById[state.nodesById[result!.node_id!]!.parentNodeId!];
  expect(importedFolder).toMatchObject({
    parentNodeId: INBOX_NODE_ID,
    title: 'Imported Markdown'
  });
  expect(state.nodesById[result!.node_id!]).toMatchObject({
    title: 'plain'
  });
});

it('reports unsupported browsers through selectFolderPath', async () => {
  const provider = createDemoExternalFolderProvider();

  await expect(provider.selectFolderPath()).rejects.toThrow('does not support choosing folders');
});
