import { describe, expect, it } from 'vitest';

import { createCollectionVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';

import {
  resolveDirectorySections
} from './CompanionDirectoryModel';
import { resolveDirectoryParentSelection } from './CompanionDirectoryParentModel';
import { resolveDirectoryRowMeta } from './CompanionDirectoryVisualModel';

const rootView = {
  items: [
    { kind: 'folder' as const, nodeId: 'folder-untitled', preview: null, title: '1Untitled Folder' },
    { kind: 'folder' as const, nodeId: 'special-inbox', preview: null, title: 'Inbox' },
    { kind: 'folder' as const, nodeId: 'special-virtual-root', preview: null, title: 'Virtual' }
  ]
};

const snapshot = {
  nodesById: {
    'folder-untitled': { parentNodeId: null },
    'special-inbox': { parentNodeId: null },
    'special-virtual-root': { parentNodeId: null }
  }
} as never;

function sectionTitles(sections: ReturnType<typeof resolveDirectorySections>) {
  return sections.map((section) => ({
    id: section.id,
    titleKey: section.titleKey,
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
  folders: [
    { documentCount: 2, folderPath: '/library/2think', id: 'external-1' },
    { documentCount: 1, folderPath: '/library/1act', id: 'external-2' }
  ],
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
      { id: 'home', titleKey: undefined, titles: ['Inbox', '1Untitled Folder'] },
      { id: 'external', titleKey: 'companion.directory.section.external', titles: ['2think', '1act'] },
      { id: 'virtual', titleKey: 'companion.directory.section.virtual', titles: ['Virtual'] },
      { id: 'trash', titleKey: 'companion.directory.section.trash', titles: [''] }
    ]);
  });

  it('counts virtual Collection rows from aggregated members', () => {
    const collectionSnapshot = {
      nodeOrder: ['special-virtual-root', 'collection-1', 'topic-1', 'topic-2'],
      nodesById: {
        'special-virtual-root': { id: 'special-virtual-root', kind: 'folder', parentNodeId: null, title: 'Virtual' },
        'collection-1': {
          id: 'collection-1',
          kind: 'folder',
          manualChildOrder: ['topic-2', 'topic-1'],
          parentNodeId: 'special-virtual-root',
          title: 'Guides',
          virtualFilter: createCollectionVirtualNodeFilter('Guides')
        },
        'topic-1': { collections: ['Guides'], id: 'topic-1', kind: 'topic', parentNodeId: null, title: 'One' },
        'topic-2': { content: '---\ncollections:\n  - "Guides"\n---\nTwo', id: 'topic-2', kind: 'topic', parentNodeId: null, title: 'Two' }
      },
      trashedNodeIds: [],
      untitledSequenceByParent: {}
    } as never;
    const collection = resolveDirectorySections({
      directory: externalDirectory,
      folderView: null,
      rootView: { items: [{ kind: 'folder', nodeId: 'collection-1', preview: null, title: 'Guides' }] },
      selection: { kind: 'root' },
      snapshot: collectionSnapshot
    }).flatMap((section) => section.items).find((item) => item.nodeId === 'collection-1');

    expect(collection && resolveDirectoryRowMeta({ directory: externalDirectory, item: collection, snapshot: collectionSnapshot }))
      .toBe('2');
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
