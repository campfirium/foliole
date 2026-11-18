// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../../../lib/core/import/superMemoSchedulePreview';

import { useSuperMemoDraft } from './useSuperMemoDraft';

const runtime = vi.hoisted(() => ({
  getRuntimeSuperMemoSourceSelection: vi.fn().mockResolvedValue(null),
  connectRuntimeSuperMemoSource: vi.fn().mockResolvedValue(undefined),
  readRuntimeRememberedSuperMemoSource: vi.fn(),
  saveRuntimeSuperMemoPanel: vi.fn().mockResolvedValue(undefined),
  saveRuntimeSuperMemoSourceLink: vi.fn().mockResolvedValue(undefined),
  previewRuntimeSuperMemoImport: vi.fn(),
  selectRuntimeSuperMemoSource: vi.fn()
}));
vi.mock('../../../shared/platform/import/superMemoImportRuntimeRepository', () => runtime);

beforeEach(() => vi.clearAllMocks());

it('changes source placement in a new draft without waiting for the source to be read again', async () => {
  runtime.selectRuntimeSuperMemoSource.mockResolvedValue({
    name: 'Learning.xml', filePath: 'Learning.xml', xml: '<collection/>', collectionDirectory: 'Learning'
  });
  runtime.previewRuntimeSuperMemoImport.mockResolvedValueOnce({
    preview: { rows: [], referenceDay: '2026-11-17', pairedCollection: true }, elements: []
  }).mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useSuperMemoDraft(DEFAULT_SUPER_MEMO_GRADE_MAP, 'Choose collection'));
  await waitFor(() => expect(result.current.busy).toBe(false));
  await act(async () => result.current.loadSource());
  expect(result.current.sourceFormat.placement).toBe('topic-info');

  act(() => result.current.changeSourceFormat({ ...result.current.sourceFormat, placement: 'content-end' }));

  expect(result.current.sourceFormat.placement).toBe('content-end');
  expect(result.current.busy).toBe(false);
  expect(runtime.previewRuntimeSuperMemoImport).toHaveBeenCalledTimes(1);
});

it('restores the form while a source is missing and reads the XML only to prepare a preview', async () => {
  const savedForm = { percent: 75, sourceFormat: { placement: 'content-end', template: '{title}' } };
  const selection = { name: 'Learning.xml', filePath: '/exports/Learning.xml', savedForm };
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce(selection);
  runtime.connectRuntimeSuperMemoSource.mockRejectedValueOnce(new Error('ENOENT'));
  runtime.readRuntimeRememberedSuperMemoSource.mockResolvedValueOnce({ ...selection, xml: '<collection/>' });
  runtime.previewRuntimeSuperMemoImport.mockResolvedValueOnce({
    preview: { rows: [{ title: 'Card' }], referenceDay: '2026-11-18' }, elements: [{ id: 2 }]
  });
  const { result, rerender } = renderHook(({ open }) => useSuperMemoDraft(DEFAULT_SUPER_MEMO_GRADE_MAP, 'Choose collection', open),
    { initialProps: { open: true } });
  await waitFor(() => expect(result.current.busy).toBe(false));
  expect(result.current.selection?.name).toBe('Learning.xml');
  expect(result.current.percent).toBe(75);
  expect(result.current.sourceFormat).toEqual(savedForm.sourceFormat);
  expect(result.current.error).toBe(false);
  expect(runtime.connectRuntimeSuperMemoSource).toHaveBeenCalledOnce();
  expect(runtime.readRuntimeRememberedSuperMemoSource).not.toHaveBeenCalled();
  expect(runtime.previewRuntimeSuperMemoImport).not.toHaveBeenCalled();

  await act(async () => result.current.prepareRememberedSource());
  expect(result.current.draft?.preview.rows).toEqual([{ title: 'Card' }]);
  rerender({ open: false });
  rerender({ open: true });
  await act(async () => result.current.prepareRememberedSource());
  expect(runtime.readRuntimeRememberedSuperMemoSource).toHaveBeenCalledOnce();
  expect(runtime.previewRuntimeSuperMemoImport).toHaveBeenCalledOnce();
});
