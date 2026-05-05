import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import {
  loadWorkspaceContentSortPreference,
  saveWorkspaceContentSortPreference,
  sortExternalDocuments,
  sortWorkspaceContentRows
} from './workspaceContentSort';

const baseDocument = {
  absolutePath: '/library/doc.md',
  extension: 'md' as const,
  fileName: 'doc.md',
  folderId: 'folder-1',
  openingText: null,
  relativePath: 'doc.md'
};

function createRow(id: string, title: string, updatedAt: string) {
  return {
    depth: 0,
    descendantCount: 0,
    hasChildren: false,
    node: {
      createdAt: '2026-04-20T00:00:00.000Z',
      hasContent: true,
      hasReveal: false,
      id,
      parentNodeId: null,
      review: null,
      title,
      updatedAt
    }
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

it('persists the workspace content sort preference', () => {
  saveWorkspaceContentSortPreference({ direction: 'asc', key: 'name' });

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceContentSort)).toBe(
    JSON.stringify({ direction: 'asc', key: 'name' })
  );
  expect(loadWorkspaceContentSortPreference()).toEqual({ direction: 'asc', key: 'name' });
});

it('sorts external documents by newest date by default and supports name descending', () => {
  const documents = [
    { ...baseDocument, modifiedAt: '2026-04-20T00:00:00.000Z', title: 'Alpha' },
    { ...baseDocument, absolutePath: '/library/b.md', modifiedAt: '2026-04-22T00:00:00.000Z', title: 'Beta' }
  ];

  expect(sortExternalDocuments(documents, { direction: 'desc', key: 'modifiedAt' }).map((document) => document.title)).toEqual(['Beta', 'Alpha']);
  expect(sortExternalDocuments(documents, { direction: 'desc', key: 'name' }).map((document) => document.title)).toEqual(['Beta', 'Alpha']);
});

it('sorts workspace content by last opened time when that context supports it', () => {
  const rows = [
    createRow('old', 'Old', '2026-04-22T00:00:00.000Z'),
    createRow('new', 'New', '2026-04-20T00:00:00.000Z')
  ];
  const nodeViewById = {
    new: { updatedAt: '2026-04-24T00:00:00.000Z' },
    old: { updatedAt: '2026-04-23T00:00:00.000Z' }
  };

  expect(sortWorkspaceContentRows(rows, { direction: 'desc', key: 'lastOpenedAt' }, nodeViewById).map((row) => row.node.id)).toEqual(['new', 'old']);
});
