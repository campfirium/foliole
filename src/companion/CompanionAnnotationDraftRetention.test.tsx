import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { getCompanionReadingScope, invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { CompanionSelectionAnnotationToolbar } from './CompanionSelectionAnnotationToolbar';

const state = { existingHighlight: { nodeId: 'note', originalText: 'Passage' }, left: 0, top: 0, noteLeft: 0, noteTop: 40, payload: null };
function setup(save: () => Promise<void>) {
  const original = { note: 'Saved note', guard: { nodeId: 'note', versionId: 'v1', scope: getCompanionReadingScope() } };
  const load = vi.fn(async () => original);
  const close = vi.fn();
  const props = { loadExistingHighlight: load, onAddExistingHighlightNote: vi.fn(save), onApply: vi.fn(), onClose: close, onDeleteExistingHighlight: vi.fn() };
  const surface = (open: boolean) => <StrictMode><CompanionDraftProvider>{open ? <CompanionSelectionAnnotationToolbar {...props} state={state} /> : null}</CompanionDraftProvider></StrictMode>;
  const view = renderWithLocalization(surface(true));
  return { props, original, load, close, toggle: (open: boolean) => view.rerender(surface(open)) };
}
async function editNote() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Comment' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Retained draft' } });
}

it('restores a failed draft and its original read guard after leaving the article and returning', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const { toggle, load, props, original } = setup(save);
  await editNote();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('alert');
  toggle(false);
  toggle(true);
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  expect(screen.getByRole('textbox')).toHaveValue('Retained draft');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(props.onAddExistingHighlightNote).toHaveBeenCalledTimes(2));
  expect(props.onAddExistingHighlightNote).toHaveBeenLastCalledWith('note', 'Passage', 'Retained draft', original.guard);
});

it('retains an in-flight write that fails after leaving and lets the returned view retry the same draft', async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_, fail) => { reject = fail; });
  const { toggle, load, props, close } = setup(() => pending);
  await editNote();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(props.onAddExistingHighlightNote).toHaveBeenCalledTimes(1));
  toggle(false);
  await act(async () => { reject(new Error('writer failed')); await pending.catch(() => undefined); });
  toggle(true);
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  expect(screen.getByRole('textbox')).toHaveValue('Retained draft');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
});

it('keeps an unsubmitted draft through dismissal without saving it automatically', async () => {
  const save = vi.fn(async () => undefined);
  const { toggle, load } = setup(save);
  await editNote();
  toggle(false); toggle(true);
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  expect(screen.getByRole('textbox')).toHaveValue('Retained draft');
  expect(save).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledTimes(1);
});

it('never attaches the previous library draft to the same node ID in a replacement library', async () => {
  const { toggle, load } = setup(vi.fn(async () => undefined));
  await editNote();
  toggle(false);
  act(() => invalidateCompanionReadingScope());
  load.mockResolvedValue({ note: 'Other library note', guard: { nodeId: 'note', versionId: 'v1', scope: getCompanionReadingScope() } });
  toggle(true);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Comment' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  expect(screen.getByRole('textbox')).toHaveValue('Other library note');
});
