import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import type { CompanionHighlightRead } from '../shared/platform/companion/reading/companionHighlightRead';

import { CompanionSelectionAnnotationToolbar } from './CompanionSelectionAnnotationToolbar';

function renderToolbar(options: { selection?: boolean; cloze?: boolean; load?: () => Promise<CompanionHighlightRead> } = {}) {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const onDelete = vi.fn();
  const onNote = vi.fn();
  renderWithLocalization(<CompanionSelectionAnnotationToolbar onOpenExistingHighlight={onOpen}
    onClose={onClose} onDeleteExistingHighlight={onDelete} onAddExistingHighlightNote={onNote} onApply={vi.fn()}
    loadExistingHighlight={options.load}
    state={{ left: 12, top: 12, noteLeft: 12, noteTop: 52, payload: null,
      ...(options.selection ? {} : { existingHighlight: { nodeId: 'highlight-1', originalText: 'Beta',
        ...(options.cloze ? { kind: 'cloze' as const } : {}) } }) }} />);
  return { onOpen, onClose, onDelete, onNote };
}

it.each([false, true])('opens the corresponding highlight or cloze once for a touch gesture, cloze=%s', (cloze) => {
  const { onOpen, onClose, onDelete, onNote } = renderToolbar({ cloze });
  const button = screen.getByRole('button', { name: 'Open' });
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
  fireEvent.touchEnd(button);
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledExactlyOnceWith('highlight-1');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onDelete).not.toHaveBeenCalled();
  expect(onNote).not.toHaveBeenCalled();
});

it('supports keyboard-generated clicks', () => {
  const { onOpen } = renderToolbar();
  fireEvent.click(screen.getByRole('button', { name: 'Open' }), { detail: 0 });
  expect(onOpen).toHaveBeenCalledExactlyOnceWith('highlight-1');
});

it('does not offer opening for a new selection', () => {
  renderToolbar({ selection: true });
  expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
});

it('blocks opening while loading and after an unavailable highlight read', async () => {
  let reject!: (error: Error) => void;
  const { onOpen } = renderToolbar({ load: () => new Promise((_, fail) => { reject = fail; }) });
  const button = screen.getByRole('button', { name: 'Open' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  await waitFor(() => expect(reject).toBeDefined());
  reject(new Error('Highlight unavailable'));
  await screen.findByRole('alert');
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(onOpen).not.toHaveBeenCalled();
});
