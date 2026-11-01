import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSelectionAnnotationToolbar } from './CompanionSelectionAnnotationToolbar';

function selection(anchorId: string, from = 6, text = 'Beta') {
  return {
    left: 12, noteLeft: 12, noteTop: 52, top: 12,
    payload: {
      anchorId, parentNodeId: 'topic', clozeContent: 'Alpha [...] Gamma', selectionText: text,
      entries: [{ anchorId, clozeContent: 'Alpha [...] Gamma', selectionText: text,
        locator: { from, to: from + text.length, originalText: text }, range: { from, to: from + text.length } }]
    }
  };
}

it('keeps an in-flight cloze submission through recalculation of the same selection', async () => {
  let finish!: () => void;
  const onApply = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const onClose = vi.fn();
  const props = { onApply, onClose, onAddExistingHighlightNote: vi.fn(), onDeleteExistingHighlight: vi.fn() };
  const view = renderWithLocalization(<CompanionSelectionAnnotationToolbar {...props} state={selection('first')} />);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Cloze' }), { button: 0 });
  expect(onApply).toHaveBeenCalledTimes(1);
  view.rerender(<CompanionSelectionAnnotationToolbar {...props} state={selection('recalculated')} />);
  expect(screen.getByRole('button', { name: 'Cloze' })).toBeDisabled();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Cloze' }), { button: 0 });
  expect(onApply).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

it('resets the comment draft when the selected source range changes', () => {
  const props = { onApply: vi.fn(), onClose: vi.fn(), onAddExistingHighlightNote: vi.fn(), onDeleteExistingHighlight: vi.fn() };
  const view = renderWithLocalization(<CompanionSelectionAnnotationToolbar {...props} state={selection('first')} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  fireEvent.change(screen.getByTestId('companion-selection-note-text'), { target: { value: 'Original draft' } });
  view.rerender(<CompanionSelectionAnnotationToolbar {...props} state={selection('other', 11, 'Gamma')} />);
  expect(screen.queryByTestId('companion-selection-note-text')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  expect(screen.getByTestId('companion-selection-note-text')).toHaveValue('');
});
