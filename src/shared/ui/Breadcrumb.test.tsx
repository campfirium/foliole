import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import { AppBreadcrumb } from './Breadcrumb';

it('keeps the ancestor levels on one line and selects a level by id', () => {
  const onSelect = vi.fn();
  renderWithLocalization(
    <AppBreadcrumb
      items={[
        { id: 'guide', label: 'Guides', title: 'Guides' },
        { id: 'welcome', label: 'Welcome to…', title: 'Welcome to Foliole' }
      ]}
      onSelect={onSelect}
    />
  );

  expect(screen.getByRole('navigation')).toHaveClass('whitespace-nowrap', 'overflow-hidden');
  expect(screen.queryByRole('button', { name: 'Expand breadcrumb path' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Welcome to…' }));
  expect(onSelect).toHaveBeenCalledWith('welcome');
});
