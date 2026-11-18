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
  pickRuntimeSuperMemoSource: vi.fn().mockResolvedValue('Learning.xml'),
  readRuntimeSuperMemoSource: vi.fn()
}));
vi.mock('../../../shared/platform/import/superMemoImportRuntimeRepository', () => runtime);

beforeEach(() => vi.clearAllMocks());

it('changes source placement in a new draft without waiting for the source to be read again', async () => {
  runtime.readRuntimeSuperMemoSource.mockResolvedValue({
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

it('restores the saved migration and its settings without reading the source', async () => {
  const savedForm = { percent: 75, sourceFormat: { placement: 'content-end', template: '{title}' } };
  const preview = { rows: [{ title: 'Card' }], referenceDay: '2026-11-18' };
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce({
    name: 'Learning.xml', filePath: '/exports/Learning.xml', savedForm, snapshot: { elements: [{ id: 2 }], preview }
  });
  const { result } = renderHook(() => useSuperMemoDraft(DEFAULT_SUPER_MEMO_GRADE_MAP, 'Choose collection'));
  await waitFor(() => expect(result.current.busy).toBe(false));
  expect(result.current.selection?.name).toBe('Learning.xml');
  expect(result.current.percent).toBe(75);
  expect(result.current.sourceFormat).toEqual(savedForm.sourceFormat);
  expect(result.current.draft?.preview).toEqual(preview);
  expect(runtime.readRuntimeRememberedSuperMemoSource).not.toHaveBeenCalled();
  expect(runtime.previewRuntimeSuperMemoImport).not.toHaveBeenCalled();
});

it('preserves explicit folder choices and discards the old implicit folder default on restore', async () => {
  const savedForm = { percent: 0, sourceFormat: { placement: 'topic-info', template: '{title}' },
    folderChoices: [{ id: 2, folder: true }] };
  const structure = { parentId: null, editable: true, folderBody: false, sourceHasBody: false };
  const rows = [1, 2].map(id => ({ id, sourceType: 'Topic', outcome: 'folder', structure }));
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce({
    name: 'Learning.xml', filePath: '/exports/Learning.xml', savedForm,
    snapshot: { elements: [], preview: { rows, referenceDay: '2026-11-18' } }
  });

  const { result } = renderHook(() => useSuperMemoDraft(DEFAULT_SUPER_MEMO_GRADE_MAP, 'Choose collection'));
  await waitFor(() => expect(result.current.draft?.preview.rows.map(row => row.outcome)).toEqual(['topic', 'folder']));
});

it('opens on Load data and skips source checks when no migration has been saved', async () => {
  render(<SuperMemoDraftDialog open close={vi.fn()} initialGrades={DEFAULT_SUPER_MEMO_GRADE_MAP} translate={undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Choose XML' })).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Load data' }).getAttribute('aria-current')).toBe('step');
  expect(runtime.checkRuntimeSuperMemoSource).not.toHaveBeenCalled();
});

it('shows the XML button spinner only after choosing a file', async () => {
  const picker = Promise.withResolvers<string | null>();
  const reading = Promise.withResolvers<null>();
  runtime.pickRuntimeSuperMemoSource.mockReturnValueOnce(picker.promise);
  runtime.readRuntimeSuperMemoSource.mockReturnValueOnce(reading.promise);
  render(<SuperMemoDraftDialog open close={vi.fn()} initialGrades={DEFAULT_SUPER_MEMO_GRADE_MAP} translate={undefined} />);
  const button = screen.getByRole('button', { name: 'Choose XML' });
  await waitFor(() => expect(button).toBeEnabled());

  fireEvent.click(button);
  expect(button).not.toHaveAttribute('aria-busy');
  expect(runtime.readRuntimeSuperMemoSource).not.toHaveBeenCalled();

  await act(async () => picker.resolve('/exports/Learning.xml'));
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(runtime.readRuntimeSuperMemoSource).toHaveBeenCalledWith('/exports/Learning.xml');

  await act(async () => reading.resolve(null));
  expect(button).toBeEnabled();
  expect(button).not.toHaveAttribute('aria-busy');
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
