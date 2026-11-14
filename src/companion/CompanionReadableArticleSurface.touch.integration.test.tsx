import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CodeMirrorEditorAdapter } from '../features/editor/adapters/CodeMirrorEditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { createSnapshot } from './companionWorkspaceSyncActions.testSupport';

function touch(target: HTMLElement, type: string, clientY = 200) {
  const event = new MouseEvent(type, { bubbles: true, clientX: 40, clientY });
  Object.defineProperties(event, {
    pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true }
  });
  fireEvent(target, event);
}

it('reveals reading controls from a short touch on the real read-only editor', async () => {
  renderWithLocalization(<MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle onExit={vi.fn()} onCreateSelectionAnnotation={vi.fn()} snapshot={null}
      readableArticle={{ content: '# Topic\n\nBaseline', hideTitleHeading: false,
        nodeId: 'touch-topic', persistedNodeViewState: null, pdfAttachmentId: null,
        textAnchorDecorations: [], title: 'Topic' }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>);
  const text = await screen.findByText('Baseline');
  expect(text.closest('[contenteditable]')).toHaveAttribute('contenteditable', 'false');
  expect(screen.queryByRole('button', { name: 'Outline' })).toBeNull();
  touch(text, 'pointerdown');
  touch(text, 'pointerup');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Outline' })).toBeVisible());
  fireEvent.click(text, { detail: 1 });
  expect(screen.getByRole('button', { name: 'Outline' })).toBeVisible();
});

it.each([
  ['item', 'pointerup'], ['topic', 'pointerup'], ['topic', 'touchend']
] as const)('only offers new selection annotations in a Topic, current kind=%s, release=%s', async (kind, release) => {
  const snapshot = createSnapshot('selection-source');
  snapshot.nodesById['selection-source']!.kind = kind;
  const onCreate = vi.fn();
  renderWithLocalization(<MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle onExit={vi.fn()} onCreateSelectionAnnotation={onCreate} snapshot={snapshot}
      isReviewItem={kind === 'item'} readableArticle={{ content: '# Topic\n\nSelection baseline', hideTitleHeading: false,
        nodeId: 'selection-source', persistedNodeViewState: null, pdfAttachmentId: null,
        textAnchorDecorations: [], title: 'Topic' }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>);
  const text = await screen.findByText('Selection baseline');
  const range = document.createRange();
  range.selectNodeContents(text);
  Object.defineProperty(range, 'getClientRects', { value: () => [] });
  Object.defineProperty(range, 'getBoundingClientRect', { value: () => new DOMRect(20, 160, 100, 20) });
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  if (release === 'touchend') fireEvent.touchEnd(text, { changedTouches: [{ clientX: 40, clientY: 200 }], touches: [] });
  else touch(text, 'pointerup');
  await act(async () => {
    await new Promise<void>(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
  });
  if (kind === 'topic') await waitFor(() => expect(screen.getByRole('button', { name: 'Highlight' })).toBeVisible());
  else {
    await waitFor(() => expect(screen.getByText('Selection baseline')).toBeVisible());
    expect(screen.queryByRole('button', { name: 'Highlight' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cloze' })).toBeNull();
  }
  expect(onCreate).not.toHaveBeenCalled();
  window.getSelection()!.removeAllRanges();
});

it.each([
  { flow: false, target: 'Other passage' },
  { flow: true, target: 'Other passage' },
  { flow: true, target: 'Reading margin' }
])('dismisses a Topic selection on $target with Flow=$flow', async ({ flow, target }) => {
  const snapshot = createSnapshot('selection-source');
  const onCreate = vi.fn();
  renderWithLocalization(<MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle flow={flow} footer={<div aria-label="Reading margin" />} onExit={vi.fn()} onCreateSelectionAnnotation={onCreate} snapshot={snapshot}
      readableArticle={{ content: '# Topic\n\nSelected passage\n\nOther passage', hideTitleHeading: false,
        nodeId: 'selection-source', persistedNodeViewState: null, pdfAttachmentId: null,
        textAnchorDecorations: [], title: 'Topic' }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>);
  const selected = await screen.findByText('Selected passage');
  const outside = target === 'Reading margin' ? screen.getByLabelText(target) : screen.getByText(target);
  const range = document.createRange();
  range.selectNodeContents(selected);
  Object.defineProperty(range, 'getClientRects', { value: () => [new DOMRect(20, 160, 100, 20)] });
  Object.defineProperty(range, 'getBoundingClientRect', { value: () => new DOMRect(20, 160, 100, 20) });
  const selection = window.getSelection()!;
  try {
    touch(selected, 'pointerdown');
    selection.addRange(range);
    touch(selected, 'pointerup');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Highlight' })).toBeVisible());

    touch(outside, 'pointerdown');
    touch(outside, 'pointerup');
    expect(selection.toString()).toBe('');
    expect(screen.queryByRole('button', { name: 'Highlight' })).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
  } finally {
    selection.removeAllRanges();
  }
});

it.each(['touchend after pointercancel', 'pointerup after movement'])(
  'opens an existing highlight only for a tap, with %s as the scroll release',
  async release => {
    const snapshot = createSnapshot('selection-source');
    const source = snapshot.nodesById['selection-source']!;
    source.content = 'Highlighted passage';
    snapshot.nodesById['existing-highlight'] = {
      ...source, id: 'existing-highlight', parentNodeId: source.id, content: 'Highlighted',
      anchorLink: { id: 'anchor', kind: 'highlight', locator: { from: 0, to: 11, originalText: 'Highlighted' } }
    };
    snapshot.nodeOrder.push('existing-highlight');
    const position = vi.spyOn(CodeMirrorEditorAdapter.prototype, 'getDocumentPositionAtClientPoint').mockReturnValue(2);
    try {
      renderWithLocalization(<MouseGestureSettingsProvider><CompanionDraftProvider>
        <ImmersiveReadableArticle onExit={vi.fn()} onCreateSelectionAnnotation={vi.fn()} snapshot={snapshot}
          readableArticle={{ content: source.content, hideTitleHeading: false,
            nodeId: source.id, persistedNodeViewState: null, pdfAttachmentId: null,
            textAnchorDecorations: [{ from: 0, to: 11, kind: 'highlight', nodeId: 'existing-highlight' }], title: 'Topic' }} />
      </CompanionDraftProvider></MouseGestureSettingsProvider>);
      const mark = await screen.findByText('Highlighted', { selector: '.cm-md-highlight' });
      touch(mark, 'pointerdown');
      touch(mark, 'pointermove', 140);
      if (release === 'touchend after pointercancel') {
        touch(mark, 'pointercancel', 140);
        fireEvent.touchEnd(mark, { changedTouches: [{ clientX: 40, clientY: 140 }], touches: [] });
      } else {
        touch(mark, 'pointerup', 140);
      }
      await act(async () => new Promise(resolve => setTimeout(resolve, 320)));
      expect(screen.queryByRole('toolbar')).toBeNull();

      touch(mark, 'pointerdown');
      touch(mark, 'pointerup');
      fireEvent.touchEnd(mark, { changedTouches: [{ clientX: 40, clientY: 200 }], touches: [] });
      fireEvent.click(mark, { clientX: 40, clientY: 200, detail: 1 });
      expect(await screen.findByRole('button', { name: 'Close Highlight' })).toBeVisible();
    } finally {
      position.mockRestore();
    }
  }
);
