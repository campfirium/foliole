// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../../../lib/core/import/superMemoSchedulePreview';

import { SuperMemoDraftDialog } from './SuperMemoDraftDialog';
import { useSuperMemoDraft } from './useSuperMemoDraft';

const runtime = vi.hoisted(() => ({
  checkRuntimeSuperMemoSource: vi.fn().mockResolvedValue(null),
  getRuntimeSuperMemoSourceSelection: vi.fn().mockResolvedValue(null),
  listRuntimeSuperMemoImports: vi.fn().mockResolvedValue([]),
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

it('restores the form before loading the saved JSON draft', async () => {
  const savedForm = { percent: 75, sourceFormat: { placement: 'content-end', template: '{title}' } };
  const selection = { name: 'Learning.xml', filePath: '/exports/Learning.xml', savedForm };
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce(selection);
  runtime.readRuntimeRememberedSuperMemoSource.mockResolvedValueOnce({ ...selection, xml: '', draft: { elements: [{ id: 2 }] } });
  runtime.previewRuntimeSuperMemoImport.mockResolvedValueOnce({
    preview: { rows: [{ title: 'Card' }], referenceDay: '2026-11-18' }, elements: [{ id: 2 }]
  });
  const { result } = renderHook(() => useSuperMemoDraft(DEFAULT_SUPER_MEMO_GRADE_MAP, 'Choose collection'));
  await waitFor(() => expect(result.current.busy).toBe(false));
  expect(result.current.selection?.name).toBe('Learning.xml');
  expect(result.current.percent).toBe(75);
  expect(result.current.sourceFormat).toEqual(savedForm.sourceFormat);
  expect(result.current.error).toBe(false);
  expect(runtime.readRuntimeRememberedSuperMemoSource).not.toHaveBeenCalled();
  expect(runtime.previewRuntimeSuperMemoImport).not.toHaveBeenCalled();

  await act(async () => result.current.prepareRememberedSource());
  expect(result.current.draft?.preview.rows).toEqual([{ title: 'Card' }]);
  await act(async () => result.current.prepareRememberedSource());
  expect(runtime.readRuntimeRememberedSuperMemoSource).toHaveBeenCalledOnce();
  expect(runtime.previewRuntimeSuperMemoImport).toHaveBeenCalledOnce();
});

it('continues from restored scheduling settings before a migration preview exists', async () => {
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce({
    name: 'Learning.xml', filePath: '/exports/Learning.xml', hasDraft: false, panel: { step: 'schedule' },
    savedForm: { percent: 0, sourceFormat: { placement: 'topic-info', template: '{title}' } }
  });
  render(<SuperMemoDraftDialog open close={vi.fn()} initialGrades={DEFAULT_SUPER_MEMO_GRADE_MAP} translate={undefined} />);

  await screen.findByText('First review dates');
  const next = screen.getByRole('button', { name: 'Next' });
  await act(async () => { fireEvent.click(next); });

  expect(screen.getByRole('button', { name: 'Grade mapping' }).getAttribute('aria-current')).toBe('step');
  expect(runtime.saveRuntimeSuperMemoPanel).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/exports/Learning.xml' }), { step: 'grades' });
  expect(runtime.readRuntimeRememberedSuperMemoSource).not.toHaveBeenCalled();
});

it('opens both draft-dependent pages for an older XML selection and offers to load it', async () => {
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce({
    name: 'Learning.xml', filePath: '/exports/Learning.xml', hasDraft: false,
    savedForm: { percent: 0, sourceFormat: { placement: 'topic-info', template: '{title}' } }
  });
  render(<SuperMemoDraftDialog open close={vi.fn()} initialGrades={DEFAULT_SUPER_MEMO_GRADE_MAP} translate={undefined} />);

  await screen.findByText(/Load this export once/);
  for (const name of ['Import structure', 'Confirm migration']) {
    const step = screen.getByRole('button', { name });
    await act(async () => { fireEvent.click(step); });
    expect(step.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: 'Change XML' })).toBeEnabled();
  }
  expect(runtime.readRuntimeRememberedSuperMemoSource).not.toHaveBeenCalled();
  expect(runtime.selectRuntimeSuperMemoSource).not.toHaveBeenCalled();
});

it('updates folder choices immediately using the prepared structure', async () => {
  const row = { id: 1, parentId: null, sourceType: 'Concept', outcome: 'folder',
    structure: { parentId: null, editable: true, folderBody: true, sourceHasBody: true } };
  runtime.previewRuntimeSuperMemoImport.mockResolvedValueOnce({
    preview: { rows: [row], previewSignature: 'source-signature' },
    elements: [{ id: 1, parentId: null, children: [], sourceType: 'Concept' }], folderChoices: []
  });
  const { result } = renderHook(() => useSuperMemoDraft(DEFAULT_SUPER_MEMO_GRADE_MAP, 'Choose collection'));
  await waitFor(() => expect(result.current.busy).toBe(false));
  await act(async () => result.current.loadSource());

  runtime.saveRuntimeSuperMemoSourceLink.mockImplementationOnce(() => new Promise(() => {}));
  act(() => result.current.changeFolder(1, false));

  expect(result.current.busy).toBe(false);
  expect(result.current.draft?.preview.rows[0]?.outcome).toBe('topic');
  expect(result.current.draft?.folderChoices).toEqual([{ id: 1, folder: false }]);
  expect(runtime.previewRuntimeSuperMemoImport).toHaveBeenCalledOnce();
});
