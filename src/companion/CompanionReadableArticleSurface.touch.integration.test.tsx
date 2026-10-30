import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { createSnapshot } from './companionWorkspaceSyncActions.testSupport';

function touch(target: HTMLElement, type: string) {
  const event = new MouseEvent(type, { bubbles: true, clientX: 40, clientY: 200 });
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

it.each(['item', 'topic'] as const)('only offers new selection annotations in a Topic, current kind=%s', async kind => {
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
  touch(text, 'pointerup');
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
