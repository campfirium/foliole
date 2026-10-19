import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

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
