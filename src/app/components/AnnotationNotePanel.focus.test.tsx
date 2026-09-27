import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { AnnotationNotePanel } from './AnnotationNotePanel';

it('focuses the annotation editor when it opens', () => {
  renderWithLocalization(
    <AnnotationNotePanel
      draft=""
      left={12}
      onCancel={vi.fn()}
      onChange={vi.fn()}
      onSave={vi.fn()}
      top={24}
    />
  );

  const textarea = screen.getByPlaceholderText('Add an annotation...');
  expect(textarea).toHaveFocus();
});

it('cancels the annotation note panel on Escape', () => {
  const onCancel = vi.fn();
  renderWithLocalization(
    <AnnotationNotePanel
      draft=""
      left={12}
      onCancel={onCancel}
      onChange={vi.fn()}
      onSave={vi.fn()}
      top={24}
    />
  );

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(onCancel).toHaveBeenCalledTimes(1);
});
