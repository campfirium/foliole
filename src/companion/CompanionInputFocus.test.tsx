import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionCaptureSheet } from './CompanionCaptureSheet';
import { CompanionSearchContent } from './CompanionSearchContent';
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

// Framed mobile inputs let their frame carry focus, so the field itself draws no inner ring.
function expectFramedInputWithoutInnerRing(element: HTMLElement) {
  expect(element.className).toContain('app-focus-silent');
  expect(element.className).toContain('focus-visible:outline-none');
  expect(element.className).toContain('focus-visible:ring-0');
  expect(element.className).not.toContain('focus-visible:ring-1');
}

it('keeps the framed capture textarea free of an inner focus ring', () => {
  renderWithLocalization(<CompanionCaptureSheet draftScope="focus-test" onOpenChange={vi.fn()} onSave={vi.fn()} open />);

  expectFramedInputWithoutInnerRing(screen.getByLabelText('Capture text'));
});

it('keeps the framed selection note textarea free of an inner focus ring', () => {
  renderWithLocalization(
    <CompanionSelectionAnnotationToolbar
      onAddExistingHighlightNote={vi.fn()}
      onApply={vi.fn()}
      onClose={vi.fn()}
      onDeleteExistingHighlight={vi.fn()}
      state={{
        left: 12,
        noteLeft: 12,
        noteTop: 52,
        payload,
        top: 12
      }}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));

  const editor = screen.getByPlaceholderText('Add annotation...');
  expectFramedInputWithoutInnerRing(editor);
  expect(editor).toHaveFocus();
});

it('keeps the companion search input focus visible through its accent underline', () => {
  renderWithLocalization(<CompanionSearchContent />);

  const search = screen.getByRole('searchbox', { name: 'Search topics' });
  expect(search).toBeEnabled();
  expect(search.className).toContain('focus-visible:outline-none');
  expect(search.className).toContain('focus-visible:ring-0');
  expect(search.className).toContain('focus-visible:border-companion-accent');
});
