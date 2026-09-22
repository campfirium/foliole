import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import type { CompanionHighlightRead } from '../shared/platform/companion/reading/companionHighlightRead';
import { getCompanionReadingScope, invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { CompanionSelectionAnnotationToolbar } from './CompanionSelectionAnnotationToolbar';

const state = (nodeId = 'a') => ({ existingHighlight: { nodeId, originalText: 'passage' }, left: 0, top: 0, noteLeft: 0, noteTop: 40, payload: null });
const result = (nodeId = 'a', note = 'Original note'): CompanionHighlightRead => ({ note, guard: { nodeId, versionId: 'v1', scope: getCompanionReadingScope() } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

it('loads only the requested annotation and does not expose an empty editable note while waiting', async () => {
  const pending = deferred<CompanionHighlightRead>();
  const load = vi.fn(() => pending.promise);
  const save = vi.fn();
  const props = { loadExistingHighlight: load, onAddExistingHighlightNote: save, onApply: vi.fn(), onClose: vi.fn(), onDeleteExistingHighlight: vi.fn(), state: state() };
  const view = renderWithLocalization(<CompanionSelectionAnnotationToolbar {...props} />);
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add Comment' })).toBeDisabled();
  view.rerender(<CompanionSelectionAnnotationToolbar {...props} state={{ ...state(), left: 30 }} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  expect(load).toHaveBeenCalledWith('a');
  await act(async () => pending.resolve(result()));
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  expect(screen.getByRole('textbox')).toHaveValue('Original note');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited note' } });
  view.rerender(<CompanionSelectionAnnotationToolbar {...props} loadExistingHighlight={vi.fn()} state={{ ...state(), left: 60 }} />);
  expect(screen.getByRole('textbox')).toHaveValue('Edited note');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith('a', 'passage', 'Edited note', result().guard));
});

it('shows a retry after a failed read and only enables editing after the retry succeeds', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('missing')).mockResolvedValueOnce(result());
  renderWithLocalization(<CompanionSelectionAnnotationToolbar state={state()} loadExistingHighlight={load}
    onAddExistingHighlightNote={vi.fn()} onApply={vi.fn()} onClose={vi.fn()} onDeleteExistingHighlight={vi.fn()} />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add Comment' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Comment' })).toBeEnabled());
  expect(load).toHaveBeenCalledTimes(2);
});

it('rejects late A results after A to B to A and after closing the toolbar', async () => {
  const first = deferred<CompanionHighlightRead>();
  const last = deferred<CompanionHighlightRead>();
  const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(result('b', 'B note')).mockReturnValueOnce(last.promise);
  const props = { loadExistingHighlight: load, onAddExistingHighlightNote: vi.fn(), onApply: vi.fn(), onClose: vi.fn(), onDeleteExistingHighlight: vi.fn() };
  const view = renderWithLocalization(<CompanionSelectionAnnotationToolbar {...props} state={state()} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  view.rerender(<CompanionSelectionAnnotationToolbar {...props} state={state('b')} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  view.rerender(<CompanionSelectionAnnotationToolbar {...props} state={state()} />);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  await act(async () => first.resolve(result('a', 'Obsolete note')));
  expect(screen.getByRole('button', { name: 'Add Comment' })).toBeDisabled();
  view.rerender(<CompanionSelectionAnnotationToolbar {...props} state={null} />);
  await act(async () => last.resolve(result()));
  expect(screen.queryByRole('toolbar')).toBeNull();
});

it('retains the edited note after a failed write and closes only after a successful retry', async () => {
  const write = deferred<void>();
  const save = vi.fn().mockRejectedValueOnce(new Error('write failed')).mockReturnValueOnce(write.promise);
  const close = vi.fn();
  renderWithLocalization(<CompanionSelectionAnnotationToolbar state={state()} loadExistingHighlight={vi.fn(async () => result())}
    onAddExistingHighlightNote={save} onApply={vi.fn()} onClose={close} onDeleteExistingHighlight={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Comment' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('Unsaved note');
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(close).not.toHaveBeenCalled();
  await act(async () => write.resolve());
  expect(close).toHaveBeenCalledTimes(1);
});

it('does not retry an old target in a replacement library or close after an obsolete save completes', async () => {
  const write = deferred<void>();
  const load = vi.fn(async () => result());
  const close = vi.fn();
  const save = vi.fn(() => write.promise);
  renderWithLocalization(<CompanionSelectionAnnotationToolbar state={state()} loadExistingHighlight={load}
    onAddExistingHighlightNote={save} onApply={vi.fn()} onClose={close} onDeleteExistingHighlight={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Comment' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  act(() => invalidateCompanionReadingScope());
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  expect(screen.getByRole('textbox')).toHaveValue('Unsaved note');
  await act(async () => write.resolve());
  expect(close).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledTimes(1);
});
