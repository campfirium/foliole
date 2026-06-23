import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import { AppBreadcrumb } from './Breadcrumb';

it('keeps breadcrumb labels on one truncated line', () => {
  renderWithLocalization(
    <AppBreadcrumb
      items={[
        { id: 'guide', label: 'Guides' },
        { id: 'welcome', label: 'Welcome to Foliole' },
        { id: 'reading', label: 'Reading: Break the Whole into Pieces', isCurrent: true }
      ]}
      onSelect={vi.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'Reading: Break the Whole into Pieces' })).toHaveClass('whitespace-nowrap');
});
