import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { ElectronAPI } from '../../shared/platform/electronApi';
import {
  rebuildRuntimeExternalSearchIndex,
  refreshRuntimeExternalSearchFolders,
  saveRuntimeExternalSearchFolders
} from '../../shared/platform/externalSearchRuntimeRepository';

import { useExternalLibraryView } from './useExternalLibraryView';

function createNativeFolder() {
  return {
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    created_at: '2026-04-21T00:00:00.000Z',
    document_count: 1,
    excluded_dirs: [],
    folder_path: '/library/two think',
    id: 'folder-ext',
    indexed_at: '2026-04-21T00:00:00.000Z',
    last_error: null,
    status: 'ready',
    updated_at: '2026-04-21T00:00:00.000Z'
  };
}

function createNativeEntry() {
  return {
    absolute_path: '/library/two think/a.md',
    extension: 'md',
    file_name: 'a.md',
    folder_id: 'folder-ext',
    folder_path: '/library/two think',
    modified_at: '2026-04-21T00:00:00.000Z',
    opening_text: 'Alpha opening',
    relative_path: 'a.md',
    title: 'Alpha'
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete window.electronAPI;
});

it('updates workspace external folders immediately after settings save removes them', async () => {
  const invoke = vi.fn(async (command: string) => {
    if (command === NATIVE_COMMANDS.loadExternalSearchFolders) {
      return [createNativeFolder()];
    }
    if (command === NATIVE_COMMANDS.loadExternalSearchBrowseEntries) {
      return [];
    }
    if (command === NATIVE_COMMANDS.saveExternalSearchFolders) {
      return [];
    }
    return null;
  });
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const { result } = renderHook(() => useExternalLibraryView());

  await waitFor(() => {
    expect(result.current.folders).toHaveLength(1);
  });

  act(() => {
    result.current.openExternalFolder('folder-ext');
  });

  expect(result.current.selection).toEqual({ folderId: 'folder-ext', kind: 'folder' });

  await act(async () => {
    await saveRuntimeExternalSearchFolders([]);
  });

  await waitFor(() => {
    expect(result.current.folders).toEqual([]);
    expect(result.current.selection).toEqual({ kind: 'root' });
  });
});

it('reloads cached external entries when a folder index update arrives', async () => {
  const indexedFolder = {
    ...createNativeFolder(),
    document_count: 1,
    indexed_at: '2026-04-21T00:01:00.000Z',
    status: 'ready'
  };
  let browseLoadCount = 0;
  const invoke = vi.fn(async (command: string) => {
    if (command === NATIVE_COMMANDS.loadExternalSearchFolders) {
      return [{ ...createNativeFolder(), document_count: 0, indexed_at: null, status: 'idle' }];
    }
    if (command === NATIVE_COMMANDS.loadExternalSearchBrowseEntries) {
      browseLoadCount += 1;
      return browseLoadCount === 1 ? [] : [createNativeEntry()];
    }
    if (command === NATIVE_COMMANDS.rebuildExternalSearchIndex) {
      return [indexedFolder];
    }
    return null;
  });
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const { result } = renderHook(() => useExternalLibraryView());

  await waitFor(() => {
    expect(result.current.entriesByFolderId['folder-ext']).toEqual([]);
  });

  await act(async () => {
    await rebuildRuntimeExternalSearchIndex('folder-ext');
  });

  await waitFor(() => {
    expect(result.current.entriesByFolderId['folder-ext']?.map((entry) => entry.relativePath)).toEqual(['a.md']);
  });
});

it('shows Readwise-managed external folders after a runtime refresh', async () => {
  let folders = [createNativeFolder()];
  const invoke = vi.fn(async (command: string) => {
    if (command === NATIVE_COMMANDS.loadExternalSearchFolders) {
      return folders;
    }
    if (command === NATIVE_COMMANDS.loadExternalSearchBrowseEntries) {
      return [];
    }
    return null;
  });
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const { result } = renderHook(() => useExternalLibraryView());

  await waitFor(() => {
    expect(result.current.folders.map((folder) => folder.id)).toEqual(['folder-ext']);
  });

  folders = [
    ...folders,
    {
      ...createNativeFolder(),
      folder_path: '/Readwise/Full Document Contents/Articles',
      id: 'readwise-reader-import-articles'
    }
  ];

  await act(async () => {
    await refreshRuntimeExternalSearchFolders();
  });

  await waitFor(() => {
    expect(result.current.folders.map((folder) => folder.id)).toEqual([
      'folder-ext',
      'readwise-reader-import-articles'
    ]);
  });
});

it('keeps document panel navigation history when opening an external document from notes', async () => {
  const invoke = vi.fn(async (command: string) => {
    if (command === NATIVE_COMMANDS.loadExternalSearchFolders) {
      return [createNativeFolder()];
    }
    if (command === NATIVE_COMMANDS.loadExternalSearchBrowseEntries) {
      return [createNativeEntry()];
    }
    return null;
  });
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const { result } = renderHook(() => useExternalLibraryView());

  await waitFor(() => {
    expect(result.current.folders).toHaveLength(1);
  });

  act(() => {
    result.current.openExternalDocument({ absolutePath: '/library/two think/a.md', folderId: 'folder-ext' });
  });

  expect(result.current.isExternalViewOpen).toBe(true);
  expect(result.current.selection).toEqual({
    absolutePath: '/library/two think/a.md',
    folderId: 'folder-ext',
    kind: 'document'
  });
  expect(result.current.canGoBack).toBe(true);

  act(() => {
    expect(result.current.goBack()).toBe(true);
  });

  expect(result.current.isExternalViewOpen).toBe(false);
  expect(result.current.selection).toEqual({ kind: 'root' });
  expect(result.current.canGoForward).toBe(true);

  act(() => {
    expect(result.current.goForward()).toBe(true);
  });

  expect(result.current.isExternalViewOpen).toBe(true);
  expect(result.current.selection).toEqual({
    absolutePath: '/library/two think/a.md',
    folderId: 'folder-ext',
    kind: 'document'
  });
});

it('clears the previous active node at every external-view entry point', async () => {
  const invoke = vi.fn(async (command: string) => {
    if (command === NATIVE_COMMANDS.loadExternalSearchFolders) return [createNativeFolder()];
    if (command === NATIVE_COMMANDS.loadExternalSearchBrowseEntries) return [createNativeEntry()];
    return null;
  });
  window.electronAPI = { invoke } as unknown as ElectronAPI;
  const clearActiveNode = vi.fn();
  const { result } = renderHook(() => useExternalLibraryView(clearActiveNode));
  await waitFor(() => expect(result.current.folders).toHaveLength(1));

  act(() => result.current.openExternalFolder('folder-ext'));
  act(() => result.current.openExternalDocument({ absolutePath: '/library/two think/a.md', folderId: 'folder-ext' }));

  expect(clearActiveNode).toHaveBeenCalledTimes(2);
});

it('steps back through external folder selections before returning to notes', async () => {
  const invoke = vi.fn(async (command: string) => {
    if (command === NATIVE_COMMANDS.loadExternalSearchFolders) {
      return [createNativeFolder()];
    }
    if (command === NATIVE_COMMANDS.loadExternalSearchBrowseEntries) {
      return [createNativeEntry()];
    }
    return null;
  });
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const { result } = renderHook(() => useExternalLibraryView());

  await waitFor(() => {
    expect(result.current.folders).toHaveLength(1);
  });

  act(() => {
    result.current.openExternalFolder('folder-ext');
  });
  act(() => {
    result.current.openExternalDocument({ absolutePath: '/library/two think/a.md', folderId: 'folder-ext' });
  });

  act(() => {
    expect(result.current.goBack()).toBe(true);
  });

  expect(result.current.isExternalViewOpen).toBe(true);
  expect(result.current.selection).toEqual({ folderId: 'folder-ext', kind: 'folder' });

  act(() => {
    expect(result.current.goBack()).toBe(true);
  });

  expect(result.current.isExternalViewOpen).toBe(false);
  expect(result.current.selection).toEqual({ kind: 'root' });
});
