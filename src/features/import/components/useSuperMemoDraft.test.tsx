// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_SUPER_MEMO_GRADE_MAP } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';

import { SuperMemoDraftDialog } from './SuperMemoDraftDialog';
import { useSuperMemoDraft } from './useSuperMemoDraft';

const runtime = vi.hoisted(() => ({
  activateSavedRuntimeSuperMemoSource: vi.fn().mockResolvedValue(null),
  checkRuntimeSuperMemoSource: vi.fn().mockResolvedValue(null),
  getRuntimeSuperMemoSourceSelection: vi.fn().mockResolvedValue(null),
  parseRuntimeSuperMemoBodies: vi.fn(),
  parseRuntimeSuperMemoSource: vi.fn(),
  readRuntimeRememberedSuperMemoSource: vi.fn(),
  runRuntimeSuperMemoImport: vi.fn(),
  saveRuntimeSuperMemoPanel: vi.fn().mockResolvedValue(undefined),
  saveRuntimeSuperMemoSourceLink: vi.fn().mockResolvedValue(undefined),
  previewRuntimeSuperMemoImport: vi.fn(),
  pickRuntimeSuperMemoSource: vi.fn().mockResolvedValue('Learning.xml'),
  readRuntimeSuperMemoSource: vi.fn()
}));
vi.mock('../../../shared/platform/import/superMemoImportRuntimeRepository', () => runtime);

beforeEach(() => vi.clearAllMocks());

it('uses same-name Meta fields for a newly loaded source', async () => {
  runtime.readRuntimeSuperMemoSource.mockResolvedValue({
    name: 'Learning.xml', filePath: 'Learning.xml', xml: '<collection/>', collectionDirectory: 'Learning'
  });
  runtime.previewRuntimeSuperMemoImport.mockResolvedValueOnce({
    preview: { rows: [], referenceDay: '2026-11-17', pairedCollection: true }, elements: []
  }).mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useSuperMemoDraft(DEFAULT_SUPER_MEMO_GRADE_MAP, 'Choose collection'));
  await waitFor(() => expect(result.current.busy).toBe(false));
  await act(async () => result.current.loadSource());
  expect(result.current.sourceFormat).toMatchObject({ placement: 'metadata', referenceMap: {} });
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
  expect(result.current.sourceFormat.placement).toBe('metadata');
  expect(result.current.draft?.preview).toEqual(preview);
  expect(runtime.readRuntimeRememberedSuperMemoSource).not.toHaveBeenCalled();
  expect(runtime.previewRuntimeSuperMemoImport).not.toHaveBeenCalled();
});

it('restores candidate defaults while preserving a deliberately cleared folder', async () => {
  const savedForm = { percent: 0, sourceFormat: { placement: 'topic-info', template: '{title}' },
    folderChoices: [{ id: 2, folder: false }] };
  const structure = { parentId: null, editable: true, folderBody: false, sourceHasBody: false };
  const rows = [1, 2].map(id => ({ id, sourceType: 'Topic', outcome: 'folder', structure }));
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce({
    name: 'Learning.xml', filePath: '/exports/Learning.xml', savedForm,
    snapshot: { elements: [{ id: 1, children: [10] }, { id: 2, children: [20] }], preview: { rows, referenceDay: '2026-11-18' } }
  });

  const { result } = renderHook(() => useSuperMemoDraft(DEFAULT_SUPER_MEMO_GRADE_MAP, 'Choose collection'));
  await waitFor(() => expect(result.current.draft?.preview.rows.map(row => row.outcome)).toEqual(['folder', 'topic']));
});

it('opens on Load data and skips source checks when no migration has been saved', async () => {
  render(<SuperMemoDraftDialog open close={vi.fn()} initialGrades={DEFAULT_SUPER_MEMO_GRADE_MAP} translate={undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Choose XML' })).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Load data' }).getAttribute('aria-current')).toBe('step');
  expect(runtime.checkRuntimeSuperMemoSource).not.toHaveBeenCalled();
});

it('restores a migration saved on the former Source information step into Import structure', async () => {
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce({
    name: 'Learning.xml', filePath: '/exports/Learning.xml', panel: { step: 'source' },
    savedForm: { percent: 0, sourceFormat: { placement: 'content-end', template: '{title}' } },
    snapshot: { elements: [], preview: { rows: [], referenceDay: '2026-11-18' } }
  });
  render(<SuperMemoDraftDialog open close={vi.fn()} initialGrades={DEFAULT_SUPER_MEMO_GRADE_MAP} translate={undefined} />);

  await waitFor(() => expect(screen.getByRole('button', { name: 'Import structure' })).toHaveAttribute('aria-current', 'step'));
  expect(screen.queryByRole('radio', { name: 'End of each material’s content' })).toBeNull();
});

it('prepares the original body on open while the saved Load data page is visible', async () => {
  const filePath = '/exports/Learning.xml';
  const xml = '<collection/>';
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce({
    name: 'Learning.xml', filePath, panel: { step: 'load' },
    savedForm: { percent: 0, sourceFormat: { placement: 'topic-info', template: '{title}' } },
    snapshot: { elements: [], preview: { rows: [], referenceDay: '2026-11-18' } }
  });
  runtime.checkRuntimeSuperMemoSource.mockResolvedValueOnce({ filePath, xml });
  runtime.parseRuntimeSuperMemoBodies.mockReturnValueOnce([]);
  render(<SuperMemoDraftDialog open close={vi.fn()} initialGrades={DEFAULT_SUPER_MEMO_GRADE_MAP} translate={undefined} />);

  await waitFor(() => expect(runtime.parseRuntimeSuperMemoBodies).toHaveBeenCalledWith(xml));
  expect(screen.getByRole('button', { name: 'Load data' })).toHaveAttribute('aria-current', 'step');
  expect(screen.getByText(filePath)).toBeVisible();
  expect(runtime.previewRuntimeSuperMemoImport).not.toHaveBeenCalled();
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

async function openImportSettings(update?: NativeSuperMemoDirectoryUpdate) {
  const filePath = '/exports/Learning.xml';
  const preview = { rows: [], referenceDay: '2026-11-19', previewSignature: 'reviewed', directoryUpdate: update };
  runtime.getRuntimeSuperMemoSourceSelection.mockResolvedValueOnce({
    name: 'Learning.xml', filePath, panel: { step: update ? 'confirm' : 'grades' },
    savedForm: { percent: 0, sourceFormat: { placement: 'metadata', template: '', referenceMap: {} } },
    snapshot: { elements: [], preview }
  });
  runtime.readRuntimeRememberedSuperMemoSource.mockResolvedValueOnce({ filePath, xml: '<collection/>' });
  runtime.parseRuntimeSuperMemoSource.mockReturnValueOnce({ elements: [] });
  runtime.previewRuntimeSuperMemoImport.mockResolvedValueOnce({ elements: [], preview, folderChoices: [] });
  const close = vi.fn();
  render(<SuperMemoDraftDialog open close={close} initialGrades={DEFAULT_SUPER_MEMO_GRADE_MAP} translate={undefined} />);
  await waitFor(() => expect(screen.getByRole('button', { name: update ? /^Update$/ : /^Import$/ })).toBeEnabled());
  return close;
}

it('shows progress from the import click and replaces the wizard with a completion notice', async () => {
  const write = Promise.withResolvers<{ batchId: string; imported: number; skipped: number; unresolvedImages: number }>();
  runtime.runRuntimeSuperMemoImport.mockReturnValueOnce(write.promise);
  const close = await openImportSettings();
  fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));
  const importing = screen.getByRole('button', { name: 'Importing…' });
  expect(importing).toBeDisabled();
  expect(importing).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('heading', { name: 'Import settings' })).toBeVisible();
  expect(screen.queryByRole('dialog', { name: 'Import complete' })).toBeNull();

  await act(async () => write.resolve({ batchId: 'batch', imported: 1, skipped: 0, unresolvedImages: 0 }));
  expect(screen.getByRole('dialog', { name: 'Import complete' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Confirm migration' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Import settings' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(close).toHaveBeenCalledOnce();
});

it('shows an import error and keeps the import settings available for retry', async () => {
  const write = Promise.withResolvers<never>();
  runtime.runRuntimeSuperMemoImport.mockReturnValueOnce(write.promise);
  await openImportSettings();
  fireEvent.change(screen.getByRole('textbox', { name: 'Source import field name' }), { target: { value: 'repository' } });
  fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));
  await waitFor(() => expect(runtime.runRuntimeSuperMemoImport).toHaveBeenCalledOnce());
  await act(async () => write.reject(new Error('could_not_import')));
  expect(screen.getByRole('dialog', { name: 'Import failed' })).toBeVisible();
  expect(screen.queryByRole('dialog', { name: 'Import complete' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.getByRole('button', { name: /^Import$/ })).toBeEnabled();
  expect(screen.getByRole('textbox', { name: 'Source import field name' })).toHaveValue('repository');
});

it('applies changed first review settings from the same four pages for an existing batch', async () => {
  const update: NativeSuperMemoDirectoryUpdate = {
    batchId: 'saved-batch', signature: 'existing', pairedSourceRequired: false, savedPercent: 0,
    changes: [], citationChanges: [], textChanges: [], firstReviewChanges: [], withdrawals: [], withdrawnSourceIds: []
  };
  await openImportSettings(update);
  for (const title of ['Load data', 'Import structure', 'First review dates', 'Import settings']) {
    expect(screen.getByRole('button', { name: title })).toBeVisible();
  }
  expect(screen.queryByRole('button', { name: 'Confirm migration' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Author import field name' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Load data' }));
  expect(screen.getByRole('button', { name: 'Update XML' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Change XML' })).toBeVisible();
  expect(screen.queryByText('Previous imports')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'First review dates' }));
  const slider = screen.getByRole('slider');
  expect(slider).toBeEnabled();
  fireEvent.change(slider, { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import settings' }));
  const reviewed = { ...update, signature: 'weight-signature', proposedPercent: 50 };
  const prepared = { elements: [], preview: { rows: [], previewSignature: 'preview', directoryUpdate: reviewed }, folderChoices: [] };
  runtime.previewRuntimeSuperMemoImport.mockReset().mockResolvedValue(prepared);
  runtime.readRuntimeRememberedSuperMemoSource.mockResolvedValue({ filePath: '/exports/Learning.xml', xml: '<collection/>' });
  runtime.parseRuntimeSuperMemoSource.mockReturnValue({ elements: [] });
  runtime.runRuntimeSuperMemoImport.mockResolvedValueOnce({ batchId: update.batchId, imported: 1, skipped: 0,
    unresolvedImages: 0, directoryUpdate: reviewed });
  fireEvent.click(screen.getByRole('button', { name: /^Update$/ }));
  expect(await screen.findByRole('dialog', { name: 'Review updates to the imported batch' })).toBeVisible();
  expect(runtime.runRuntimeSuperMemoImport).not.toHaveBeenCalled();
  expect(screen.getByText('First review weight changes from 0% to 50%.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Update' }));
  expect(await screen.findByRole('dialog', { name: 'Update complete' })).toBeVisible();
  expect(runtime.runRuntimeSuperMemoImport).toHaveBeenCalledWith(expect.objectContaining({
    updatePercent: 50, updateSignature: 'weight-signature', sourceFormat: expect.objectContaining({ referenceMap: {} })
  }));
});
