import { beforeEach, describe, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  loadExternalLibraryFolderOrder,
  moveExternalLibraryFolder,
  parseExternalLibraryFolderOrder,
  saveExternalLibraryFolderOrder,
  sortExternalLibraryFolders
} from './externalLibraryFolderOrder';

function folder(id: string, folderPath: string) {
  return {
    documentCount: 1,
    folderPath,
    id
  };
}

describe('externalLibraryFolderOrder', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('sorts external folders by saved identity before natural fallback', () => {
    const folders = [
      folder('folder-1', '/library/1act'),
      folder('folder-2', '/library/2think'),
      folder('folder-3', '/library/0inbox')
    ];

    const result = sortExternalLibraryFolders(folders, [
      { folderPath: 'library/2think', id: 'folder-2' },
      { folderPath: 'library/1act', id: 'folder-1' }
    ]);

    expect(result.map((item) => item.id)).toEqual(['folder-2', 'folder-1', 'folder-3']);
  });

  it('falls back to normalized path when an external folder id changes', () => {
    const result = sortExternalLibraryFolders(
      [folder('next-id', '/Library/2think'), folder('folder-1', '/library/1act')],
      [{ folderPath: 'library/2think', id: 'old-id' }]
    );

    expect(result.map((item) => item.id)).toEqual(['next-id', 'folder-1']);
  });

  it('persists external folder order through whitelisted app settings', () => {
    saveExternalLibraryFolderOrder([folder('folder-2', '/library/2think'), folder('folder-1', '/library/1act')]);

    expect(parseExternalLibraryFolderOrder(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.externalLibraryFolderOrder)))
      .toEqual([
        { folderPath: 'library/2think', id: 'folder-2' },
        { folderPath: 'library/1act', id: 'folder-1' }
      ]);
    expect(loadExternalLibraryFolderOrder().map((item) => item.id)).toEqual(['folder-2', 'folder-1']);
  });

  it('moves an external folder before a sibling for drag sorting', () => {
    const result = moveExternalLibraryFolder(
      [folder('folder-1', '/library/1act'), folder('folder-2', '/library/2think')],
      'folder-2',
      'folder-1',
      'before'
    );

    expect(result.map((item) => item.id)).toEqual(['folder-2', 'folder-1']);
  });
});
