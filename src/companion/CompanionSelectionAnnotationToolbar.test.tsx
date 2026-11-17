import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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

function renderToolbar(
  onApply = vi.fn(),
  resolveSelectionPayload?: () => typeof payload | null,
  statePayload = payload,
  noteTop = 52
) {
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
        noteTop,
        payload: statePayload,
        top: 12
      }}
      {...definedProps({ resolveSelectionPayload })}
    />
  );
  return { onAddExistingHighlightNote, onApply, onClose, onDeleteExistingHighlight };
}

function renderExistingToolbar(note?: string) {
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
        existingHighlight: {
          nodeId: 'highlight-1',
          originalText: 'Beta',
          ...definedProps({ note })
        },
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

it('starts a highlight before pointer release and closes only after its permanent write completes', async () => {
  let resolveApply: () => void = () => undefined;
  const onApply = vi.fn(() => new Promise<void>((resolve) => { resolveApply = () => resolve(); }));
  const { onClose } = renderToolbar(onApply);

  const button = screen.getByRole('button', { name: 'Highlight' });
  expect(fireEvent.pointerDown(button, { button: 0, pointerType: 'touch' })).toBe(false);

  expect(onApply).toHaveBeenCalledWith('highlight', payload, undefined);
  expect(onClose).not.toHaveBeenCalled();
  resolveApply();
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

it('uses the current selection payload even when the cached selection was longer', () => {
  const onApply = vi.fn();
  renderToolbar(onApply, () => payload, longerPayload);

  fireEvent.pointerDown(screen.getByRole('button', { name: 'Highlight' }));
  fireEvent.pointerUp(screen.getByRole('button', { name: 'Highlight' }));

  expect(onApply).toHaveBeenCalledWith('highlight', payload, undefined);
});

it('rejects another annotation action while the permanent write is pending', () => {
  const onApply = vi.fn(() => new Promise<void>(() => undefined));
  renderToolbar(onApply);

  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cloze' }));

  expect(onApply).toHaveBeenCalledTimes(1);
});

it('allows a later annotation after the previous permanent write completes', async () => {
  const onApply = vi.fn(async () => undefined);
  renderToolbar(onApply);

  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Cloze' }));

  await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2));
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

it('applies a highlight when Android ends the toolbar activation as touchend', () => {
  const onApply = vi.fn();
  renderToolbar(onApply);

  const button = screen.getByRole('button', { name: 'Highlight' });
  fireEvent.pointerDown(button);
  fireEvent.touchEnd(button);
  fireEvent.click(button);

  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledWith('highlight', payload, undefined);
});

it('deletes an existing highlight and closes after writing', async () => {
  const { onClose, onDeleteExistingHighlight } = renderExistingToolbar();

  const button = screen.getByRole('button', { name: 'Close Highlight' });
  expect(fireEvent.pointerDown(button)).toBe(false);
  fireEvent.pointerUp(button);

  await waitFor(() => expect(onDeleteExistingHighlight).toHaveBeenCalledWith('highlight-1', undefined));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Cloze' })).toBeNull();
});

it('adds a note to an existing highlight and closes after writing', async () => {
  const { onAddExistingHighlightNote, onClose } = renderExistingToolbar();

  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  fireEvent.change(screen.getByPlaceholderText('Add annotation...'), {
    target: { value: 'Existing note' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(onAddExistingHighlightNote).toHaveBeenCalledWith('highlight-1', 'Beta', 'Existing note', undefined));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('loads the existing highlight note before saving', () => {
  renderExistingToolbar('Saved note');

  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));

  expect(screen.getByPlaceholderText('Add annotation...')).toHaveValue('Saved note');
});

it('keeps the toolbar open and reports permanent write failures', async () => {
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

it('allows retrying the same annotation after a permanent write failure', async () => {
  const error = new Error('write failed');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const onApply = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
  const { onClose } = renderToolbar(onApply);

  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));

  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(onApply).toHaveBeenCalledTimes(2);
  consoleError.mockRestore();
});

it('keeps an annotation above a changing keyboard and saves the draft to the original selection', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, width: 375, offsetTop: 0, offsetLeft: 0 });
  vi.stubGlobal('visualViewport', viewport);
  const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(140);
  try {
    let resolveApply!: () => void;
    const { onApply, onClose } = renderToolbar(
      vi.fn(() => new Promise<void>((resolve) => { resolveApply = resolve; })), undefined, payload, 590
    );
    const commentButton = screen.getByRole('button', { name: 'Add Comment' });
    expect(fireEvent.pointerDown(commentButton)).toBe(false);
    fireEvent.click(commentButton);
    const textbox = screen.getByRole('textbox');
    const panel = textbox.parentElement!;
    expect(panelTopInViewport(panel)).toBeGreaterThan(500);
    fireEvent.change(textbox, { target: { value: 'Keyboard draft' } });

    act(() => {
      viewport.height = 300;
      viewport.offsetTop = 24;
      viewport.dispatchEvent(new Event('resize'));
    });
    const panelTop = panelTopInViewport(panel);
    expect(panelTop).toBeGreaterThanOrEqual(viewport.offsetTop);
    expect(panelTop + panel.offsetHeight).toBeLessThanOrEqual(viewport.offsetTop + viewport.height);
    expect(textbox).toHaveFocus();
    expect(textbox).toHaveValue('Keyboard draft');

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(fireEvent.pointerDown(saveButton)).toBe(true);
    fireEvent.click(saveButton);
    expect(onApply).toHaveBeenCalledWith('note', payload, 'Keyboard draft');
    expect(onClose).not.toHaveBeenCalled();
    resolveApply();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  } finally {
    height.mockRestore();
    vi.unstubAllGlobals();
  }
});

function panelTopInViewport(panel: HTMLElement) {
  const anchorTop = panel.style.position === 'absolute' ? parseFloat(panel.parentElement!.style.top) : 0;
  return anchorTop + parseFloat(panel.style.top);
}
