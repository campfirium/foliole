import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { definedProps } from '../shared/lib/definedProps';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import {
  CompanionSelectionAnnotationToolbar,
  type CompanionSelectionAnnotationToolbarState
} from './CompanionSelectionAnnotationToolbar';

const payload: CompanionSelectionAnnotationToolbarState['payload'] = {
  anchorId: 'anchor-1',
  clozeContent: 'Alpha [...] Gamma',
  entries: [{
    anchorId: 'anchor-1',
    clozeContent: 'Alpha [...] Gamma',
    locator: { from: 6, originalText: 'Beta', to: 10 },
    range: { from: 6, to: 10 },
    selectionText: 'Beta'
  }],
  parentNodeId: 'node-1',
  selectionText: 'Beta'
};
const longerPayload: CompanionSelectionAnnotationToolbarState['payload'] = {
  ...payload,
  clozeContent: 'Alpha [...]',
  entries: [{
    ...payload.entries[0]!,
    clozeContent: 'Alpha [...]',
    locator: { from: 6, originalText: 'Beta Gamma', to: 16 },
    range: { from: 6, to: 16 },
    selectionText: 'Beta Gamma'
  }],
  selectionText: 'Beta Gamma'
};

function renderToolbar(onApply = vi.fn(), resolveSelectionPayload?: () => typeof payload | null) {
  const onClose = vi.fn();
  const onAddExistingHighlightNote = vi.fn();
  const onDeleteExistingHighlight = vi.fn();
  renderWithLocalization(
    <CompanionSelectionAnnotationToolbar
      onAddExistingHighlightNote={onAddExistingHighlightNote}
      onApply={onApply}
      onClose={onClose}
      onDeleteExistingHighlight={onDeleteExistingHighlight}
      state={{
        left: 12,
        noteLeft: 12,
        noteTop: 52,
        payload,
        top: 12
      }}
      {...definedProps({ resolveSelectionPayload })}
    />
  );
  return { onAddExistingHighlightNote, onApply, onClose, onDeleteExistingHighlight };
}

function renderExistingToolbar() {
  const onAddExistingHighlightNote = vi.fn();
  const onClose = vi.fn();
  const onDeleteExistingHighlight = vi.fn();
  renderWithLocalization(
    <CompanionSelectionAnnotationToolbar
      onAddExistingHighlightNote={onAddExistingHighlightNote}
      onApply={vi.fn()}
      onClose={onClose}
      onDeleteExistingHighlight={onDeleteExistingHighlight}
      state={{
        existingHighlight: { nodeId: 'highlight-1', originalText: 'Beta' },
        left: 12,
        noteLeft: 12,
        noteTop: 52,
        payload: null,
        top: 12
      }}
    />
  );
  return { onAddExistingHighlightNote, onClose, onDeleteExistingHighlight };
}

it('applies a highlight with the current selection payload', async () => {
  let resolveApply: () => void = () => undefined;
  const onApply = vi.fn(() => new Promise<void>((resolve) => { resolveApply = resolve; }));
  const { onClose } = renderToolbar(onApply);

  const button = screen.getByRole('button', { name: 'Highlight' });
  expect(fireEvent.pointerDown(button)).toBe(false);
  fireEvent.pointerUp(button);

  expect(onApply).toHaveBeenCalledWith('highlight', payload, undefined);
  expect(onClose).not.toHaveBeenCalled();
  resolveApply();
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

it('refreshes the selection payload before applying a highlight', () => {
  const onApply = vi.fn();
  renderToolbar(onApply, () => longerPayload);

  fireEvent.pointerDown(screen.getByRole('button', { name: 'Highlight' }));
  fireEvent.pointerUp(screen.getByRole('button', { name: 'Highlight' }));

  expect(onApply).toHaveBeenCalledWith('highlight', longerPayload, undefined);
});

it('does not apply twice when Android emits a click after pointer activation', () => {
  const onApply = vi.fn();
  renderToolbar(onApply);

  const button = screen.getByRole('button', { name: 'Highlight' });
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
  fireEvent.click(button);

  expect(onApply).toHaveBeenCalledTimes(1);
});

it('deletes an existing highlight after the action succeeds', async () => {
  const { onClose, onDeleteExistingHighlight } = renderExistingToolbar();

  const button = screen.getByRole('button', { name: 'Close Highlight' });
  expect(fireEvent.pointerDown(button)).toBe(false);
  fireEvent.pointerUp(button);

  expect(onDeleteExistingHighlight).toHaveBeenCalledWith('highlight-1');
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button', { name: 'Cloze' })).toBeNull();
});

it('adds a note to an existing highlight after the action succeeds', async () => {
  const { onAddExistingHighlightNote, onClose } = renderExistingToolbar();

  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  fireEvent.change(screen.getByPlaceholderText('Add annotation...'), {
    target: { value: 'Existing note' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(onAddExistingHighlightNote).toHaveBeenCalledWith('highlight-1', 'Beta', 'Existing note');
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

it('saves a note annotation from the inline note panel', async () => {
  let resolveApply: () => void = () => undefined;
  const onApply = vi.fn(() => new Promise<void>((resolve) => { resolveApply = resolve; }));
  const { onClose } = renderToolbar(onApply);

  const addCommentButton = screen.getByRole('button', { name: 'Add Comment' });
  expect(fireEvent.pointerDown(addCommentButton)).toBe(false);
  fireEvent.click(addCommentButton);
  fireEvent.change(screen.getByPlaceholderText('Add annotation...'), {
    target: { value: 'Reader note' }
  });
  const saveButton = screen.getByRole('button', { name: 'Save' });
  expect(fireEvent.pointerDown(saveButton)).toBe(true);
  fireEvent.click(saveButton);

  expect(onApply).toHaveBeenCalledWith('note', payload, 'Reader note');
  expect(onClose).not.toHaveBeenCalled();
  resolveApply();
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

it('keeps the toolbar open and reports apply failures', async () => {
  const error = new Error('write failed');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { onClose } = renderToolbar(vi.fn(async () => {
    throw error;
  }));

  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));

  await waitFor(() => expect(consoleError).toHaveBeenCalledWith(
    '[companion-selection-toolbar] annotation action failed',
    error
  ));
  expect(onClose).not.toHaveBeenCalled();
  consoleError.mockRestore();
});
