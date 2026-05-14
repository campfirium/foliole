import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

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

function expectInputFocusVisible(element: HTMLElement) {
  expect(element.className).toContain('focus-visible:outline-none');
  expect(element.className).toContain('focus-visible:ring-1');
  expect(element.className).toContain('focus-visible:ring-ring');
}

it('keeps the capture textarea keyboard focus visible', () => {
  render(<CompanionCaptureSheet onOpenChange={vi.fn()} open />);

  expectInputFocusVisible(screen.getByLabelText('Capture text'));
});

it('keeps the selection note textarea keyboard focus visible', () => {
  render(
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

  fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));

  expectInputFocusVisible(screen.getByPlaceholderText('Add annotation...'));
});

it('keeps the disabled companion search input on the shared focus-visible class', () => {
  render(<CompanionSearchContent />);

  const search = screen.getByRole('searchbox', { name: 'Search topics' });
  expect(search).toBeDisabled();
  expectInputFocusVisible(search);
  expect(search.className).toContain('focus-visible:border-border-strong');
});
