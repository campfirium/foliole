import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useOpenedLocalFileEditing } from './useOpenedLocalFileEditing';

const localFileMocks = vi.hoisted(() => ({
  readLocalFile: vi.fn(),
  saveLocalFile: vi.fn()
}));

vi.mock('../../shared/platform/localFileRuntimeRepository', () => ({
  readLocalFile: localFileMocks.readLocalFile,
  saveLocalFile: localFileMocks.saveLocalFile
}));

vi.mock('../../shared/platform/importExecutionRuntimeRepository', () => ({
  runRuntimeTextFileImport: vi.fn()
}));

vi.mock('../../store/workspaceRefreshScheduler', () => ({
  refreshWorkspaceState: vi.fn()
}));

afterEach(() => {
  vi.useRealTimers();
  localFileMocks.readLocalFile.mockReset();
  localFileMocks.saveLocalFile.mockReset();
});

it('keeps local file keystrokes out of React content state while autosaving the latest text', async () => {
  vi.useFakeTimers();
  localFileMocks.saveLocalFile.mockResolvedValue({
    fileSize: 7,
    modifiedAt: '2026-06-11T12:00:00.000Z',
    status: 'saved'
  });
  const preview = {
    absolutePath: '/library/topic.md',
    content: 'Initial',
    editable: true,
    extension: 'md',
    fileName: 'topic.md',
    fileSize: 7,
    folderId: 'folder-1',
    folderPath: '/library',
    modifiedAt: '2026-06-11T11:59:00.000Z',
    relativePath: 'topic.md',
    sourceKind: 'local_file'
  } as const;

  const { result } = renderHook(() =>
    useOpenedLocalFileEditing({
      onImportedNodeId: vi.fn(),
      preview
    })
  );

  await act(async () => undefined);

  act(() => result.current.handleChange('Draft 1'));
  expect(result.current.content).toBe('Draft 1');

  act(() => result.current.handleChange('Draft 2'));
  expect(result.current.content).toBe('Draft 1');

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });

  expect(localFileMocks.saveLocalFile).toHaveBeenCalledWith(expect.objectContaining({ content: 'Draft 2' }));
  expect(result.current.content).toBe('Draft 2');
});
