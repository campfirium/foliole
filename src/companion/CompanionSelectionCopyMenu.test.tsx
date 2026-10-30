import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionSelectionAnnotationToolbar } from './CompanionSelectionAnnotationToolbar';

const clipboard = vi.hoisted(() => ({ writeClipboardText: vi.fn() }));
vi.mock('../shared/platform/companion/runtime/textClipboard', () => clipboard);

beforeEach(() => clipboard.writeClipboardText.mockReset().mockResolvedValue(undefined));

function renderToolbar(kind: 'selection' | 'highlight' | 'cloze', text = '  Beta\nGamma  ') {
  const onClose = vi.fn();
  const onApply = vi.fn();
  const onDeleteExistingHighlight = vi.fn();
  renderWithLocalization(<CompanionSelectionAnnotationToolbar
    onAddExistingHighlightNote={vi.fn()} onApply={onApply} onClose={onClose}
    onDeleteExistingHighlight={onDeleteExistingHighlight}
    state={{ left: 12, top: 12, noteLeft: 12, noteTop: 52,
      payload: { parentNodeId: 'topic', anchorId: 'anchor', selectionText: 'Selection text', clozeContent: 'Selection text', entries: [] },
      ...(kind === 'selection' ? {} : { existingHighlight: { kind, nodeId: 'annotation', originalText: text, note: 'Do not copy this comment' } })
    }} />);
  return { onClose, onApply, onDeleteExistingHighlight };
}

it.each(['selection', 'highlight', 'cloze'] as const)('copies the %s original text through More', async kind => {
  const actions = renderToolbar(kind);
  expect(screen.queryByRole('menuitem', { name: 'Copy text' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));
  await waitFor(() => expect(actions.onClose).toHaveBeenCalledTimes(1));
  expect(clipboard.writeClipboardText).toHaveBeenCalledExactlyOnceWith(kind === 'selection' ? 'Selection text' : '  Beta\nGamma  ');
  expect(actions.onApply).not.toHaveBeenCalled();
  expect(actions.onDeleteExistingHighlight).not.toHaveBeenCalled();
});

it('keeps a failed copy available for retry', async () => {
  clipboard.writeClipboardText.mockRejectedValueOnce(new Error('Denied'));
  const { onClose } = renderToolbar('cloze');
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy text');
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(clipboard.writeClipboardText).toHaveBeenCalledTimes(2);
});

it('does not duplicate a pending copy', async () => {
  let finish!: () => void;
  clipboard.writeClipboardText.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  const { onClose } = renderToolbar('highlight');
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  const copy = screen.getByRole('menuitem', { name: 'Copy text' });
  fireEvent.click(copy);
  fireEvent.click(copy);
  expect(copy).toBeDisabled();
  expect(clipboard.writeClipboardText).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

it('opens the menu once for a touch followed by a synthetic click', async () => {
  const { onClose } = renderToolbar('cloze');
  const more = screen.getByRole('button', { name: 'More' });
  fireEvent.pointerDown(more);
  fireEvent.touchEnd(more);
  fireEvent.click(more, { detail: 1 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(clipboard.writeClipboardText).toHaveBeenCalledOnce();
});

it('ignores completion after the copy menu has been dismissed', async () => {
  let finish!: () => void;
  clipboard.writeClipboardText.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  const { onClose } = renderToolbar('highlight');
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  finish();
  await waitFor(() => expect(clipboard.writeClipboardText).toHaveResolved());
  expect(onClose).not.toHaveBeenCalled();
});
