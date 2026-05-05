import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { ElectronAPI } from '../../shared/platform/electronApi';
import { saveRuntimeExternalSearchFolders } from '../../shared/platform/externalSearchBridge';

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

beforeEach(() => {
  vi.restoreAllMocks();
  window.electronAPI = undefined;
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
