import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { SettingsSection } from './SettingsSection';

it('renders title, description, and actions in the header', () => {
  const { container } = render(
    <SettingsSection actions={<button type="button">Reset all</button>} description="Section copy." title="Hotkeys">
      <div data-testid="body">body</div>
    </SettingsSection>
  );

  expect(container.querySelector('section')?.className).toContain('before:right-5');
  expect(container.querySelector('section')?.className).toContain('first:before:hidden');
  expect(screen.getByRole('heading', { level: 3, name: 'Hotkeys' })).toBeInTheDocument();
  expect(screen.getByText('Section copy.')).toBeInTheDocument();
  expect(screen.getByText('Section copy.').className).toContain('text-muted-foreground');
  expect(screen.getByRole('button', { name: 'Reset all' })).toBeInTheDocument();
  expect(screen.getByTestId('body')).toBeInTheDocument();
});

it('omits the header when no title, description, or actions are provided', () => {
  render(
    <SettingsSection>
      <div data-testid="body">body</div>
    </SettingsSection>
  );

  expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  expect(screen.getByTestId('body')).toBeInTheDocument();
});

it('exposes aria-label on the section element', () => {
  render(
    <SettingsSection ariaLabel="Hotkey settings" title="Hotkeys">
      <div>body</div>
    </SettingsSection>
  );

  expect(screen.getByLabelText('Hotkey settings').tagName).toBe('SECTION');
});

it('renders a description-only header without a title heading', () => {
  render(
    <SettingsSection description="Only description.">
      <div>body</div>
    </SettingsSection>
  );

  expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  expect(screen.getByText('Only description.')).toBeInTheDocument();
});
