// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../../../lib/core/import/superMemoSchedulePreview';

import { useSuperMemoDraft } from './useSuperMemoDraft';

const runtime = vi.hoisted(() => ({
  previewRuntimeSuperMemoImport: vi.fn(),
  selectRuntimeSuperMemoSource: vi.fn()
}));
vi.mock('../../../shared/platform/import/superMemoImportRuntimeRepository', () => runtime);

it('changes source placement in a new draft without waiting for the source to be read again', async () => {
  runtime.selectRuntimeSuperMemoSource.mockResolvedValue({
    name: 'Learning.xml', filePath: 'Learning.xml', xml: '<collection/>', collectionDirectory: 'Learning'
  });
  runtime.previewRuntimeSuperMemoImport.mockResolvedValueOnce({
    preview: { rows: [], referenceDay: '2026-11-17', pairedCollection: true }, elements: []
  }).mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useSuperMemoDraft(DEFAULT_SUPER_MEMO_GRADE_MAP, 'Choose collection'));
  await act(async () => result.current.loadSource());
  expect(result.current.sourceFormat.placement).toBe('topic-info');

  act(() => result.current.changeSourceFormat({ ...result.current.sourceFormat, placement: 'content-end' }));

  expect(result.current.sourceFormat.placement).toBe('content-end');
  expect(result.current.busy).toBe(false);
  expect(runtime.previewRuntimeSuperMemoImport).toHaveBeenCalledTimes(1);
});
