import { describe, expect, it } from 'vitest';

import {
  resolveDirectoryParentSelection,
  resolveDirectorySections
} from './CompanionDirectoryModel';

const rootView = {
  items: [
    { kind: 'folder' as const, nodeId: 'folder-1', preview: null, title: 'Inbox' },
    { kind: 'folder' as const, nodeId: 'special-virtual-root', preview: null, title: 'Virtual' }
  ]
};

const snapshot = {
  nodesById: {
    'folder-1': { parentNodeId: null },
    'special-virtual-root': { parentNodeId: null }
  }
} as never;

function sectionTitles(sections: ReturnType<typeof resolveDirectorySections>) {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    titles: section.items.map((item) => item.title)
  }));
}

function resolveSections(selection: Parameters<typeof resolveDirectorySections>[0]['selection']) {
  return resolveDirectorySections({
    directory: externalDirectory,
    folderView: null,
    rootView,
    selection,
    snapshot
  });
};

const externalDirectory = {
  folders: [{ documentCount: 2, folderPath: '/library/2think', id: 'external-1' }],
  entries: [
    {
      absolutePath: 'external-1:a.md',
      documentId: 'external-1:a.md',
      extension: 'md' as const,
      fileName: 'a.md',
      folderId: 'external-1',
      modifiedAt: '2026-04-26T01:00:00.000Z',
      openingText: 'Alpha opening',
      relativePath: 'a.md',
      title: 'Alpha'
    },
    {
      absolutePath: 'external-1:sub/b.md',
      documentId: 'external-1:sub/b.md',
      extension: 'md' as const,
      fileName: 'b.md',
      folderId: 'external-1',
      modifiedAt: '2026-04-26T01:00:00.000Z',
      openingText: 'Beta opening',
      relativePath: 'sub/b.md',
      title: 'Beta'
    }
  ]
};

describe('CompanionDirectoryModel', () => {
  it('shows internal folders and desktop external cache folders on the directory root', () => {
    const sections = resolveSections({ kind: 'root' });

    expect(sectionTitles(sections)).toEqual([
      { id: 'internal', title: 'Workspace', titles: ['Inbox'] },
      { id: 'virtual', title: 'Virtual', titles: ['Virtual'] },
      { id: 'external', title: 'External', titles: ['2think'] }
    ]);
  });

  it('builds external folder navigation from the synced desktop cache', () => {
    const folderItems = resolveSections({ folderId: 'external-1', kind: 'externalFolder' })[0]?.items ?? [];
    const subItems = resolveSections({ directoryPath: 'sub', folderId: 'external-1', kind: 'externalDirectory' })[0]?.items ?? [];

    expect(folderItems.map((item) => item.title)).toEqual(['sub', 'Alpha', 'Beta']);
    expect(subItems.map((item) => item.title)).toEqual(['Beta']);
  });

  it('returns external documents and nested directories to their immediate parent', () => {
    expect(resolveDirectoryParentSelection({
      directory: externalDirectory,
      selection: { documentId: 'external-1:sub/b.md', kind: 'externalDocument' },
      snapshot
    })).toEqual({ directoryPath: 'sub', folderId: 'external-1', kind: 'externalDirectory' });
    expect(resolveDirectoryParentSelection({
      directory: externalDirectory,
      selection: { directoryPath: 'sub', folderId: 'external-1', kind: 'externalDirectory' },
      snapshot
    })).toEqual({ folderId: 'external-1', kind: 'externalFolder' });
  });
});
