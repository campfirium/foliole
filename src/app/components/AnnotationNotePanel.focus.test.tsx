import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { AnnotationNotePanel } from './AnnotationNotePanel';

it('keeps the annotation note textarea keyboard focus visible', () => {
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

  const textarea = screen.getByPlaceholderText('Add a comment...');
  expect(textarea.className).toContain('focus-visible:outline-none');
  expect(textarea.className).toContain('focus-visible:ring-1');
  expect(textarea.className).toContain('focus-visible:ring-ring');
});
