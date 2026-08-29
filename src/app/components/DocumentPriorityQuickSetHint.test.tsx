import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentPriorityQuickSetHint } from './DocumentPriorityQuickSetHint';

it('renders the active priority panel on the semantic modal layer', () => {
  renderWithLocalization(
    <DocumentPriorityQuickSetHint isActive priority={5} />
  );

  const dialog = screen.getByRole('dialog', { name: 'Set priority' });
  expect(dialog.parentElement).toHaveClass('z-modal');
  expect(dialog.parentElement).not.toHaveClass('z-command-palette');
});
