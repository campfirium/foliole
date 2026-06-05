import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { ReviewTopicDelayPanel } from './ReviewTopicDelayPanel';

function renderPanel(overrides: Partial<Parameters<typeof ReviewTopicDelayPanel>[0]> = {}) {
  const props = {
    close: vi.fn(),
    dueDateLabel: 'Jun 22, 2026',
    errorMessage: null,
    isOpen: true,
    isSubmitting: false,
    open: vi.fn(),
    selectedLevel: 4,
    setSelectedLevel: vi.fn(),
    submit: vi.fn(async () => true),
    ...overrides
  };
  renderWithLocalization(<ReviewTopicDelayPanel {...props} />);
  return props;
}

it('shows the compact centered postpone layout without trigger shortcut text', () => {
  renderPanel();

  expect(screen.getByRole('dialog', { name: 'Postpone Topic' })).toBeInTheDocument();
  expect(screen.getByText('Postpone')).toBeInTheDocument();
  expect(screen.queryByText('Ctrl J')).not.toBeInTheDocument();
  expect(screen.getByText('0-9')).toBeInTheDocument();
  expect(screen.getByText('apply instantly')).toBeInTheDocument();
  expect(screen.getByText('Jun 22, 2026')).toBeInTheDocument();
  expect(screen.getByText('0W')).toBeInTheDocument();
  expect(screen.getByText('9W')).toBeInTheDocument();
});

it('closes with Escape and applies digit keys immediately', () => {
  const props = renderPanel();

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(props.close).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(window, { key: '7' });
  expect(props.submit).toHaveBeenCalledWith(7);
});

it('closes from the Cancel button', () => {
  const props = renderPanel();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(props.close).toHaveBeenCalledTimes(1);
});
