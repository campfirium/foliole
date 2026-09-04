import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, expect, it } from 'vitest';

import { preloadTranslationCatalog } from '../localization/translations';

import { SettingsSection } from './SettingsSection';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

it('renders title, description, and actions in the header', () => {
  const { container } = render(
    <SettingsSection actions={<button type="button">Reset all</button>} description="Section copy." title="Hotkeys">
      <div data-testid="body">body</div>
    </SettingsSection>
  );

  expect(container.querySelector('section')?.className).toContain('before:right-settings-panel-x');
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

it('exposes an independent disclosure without unmounting its content', () => {
  function DisclosureSection() {
    const [expanded, setExpanded] = useState(false);
    return (
      <SettingsSection description="Section copy." expanded={expanded} onExpandedChange={setExpanded} title="Publishing">
        <input aria-label="Account ID" />
      </SettingsSection>
    );
  }

  render(<DisclosureSection />);
  const toggle = screen.getByRole('button', { name: 'Publishing' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveClass('w-full');
  expect(screen.getByText('Section copy.').closest('button')).toBe(toggle);
  expect(screen.getByLabelText('Account ID').parentElement).toHaveClass('pl-7');
  expect(screen.getByLabelText('Account ID')).not.toBeVisible();
  fireEvent.click(screen.getByText('Section copy.'));
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByLabelText('Account ID')).toBeVisible();
});

it('can place the disclosure indicator at the end while keeping the full title row clickable', () => {
  function EndDisclosureSection() {
    const [expanded, setExpanded] = useState(false);
    return (
      <SettingsSection
        disclosureIconPosition="end"
        expanded={expanded}
        onExpandedChange={setExpanded}
        title="Gesture appearance"
      >
        <input aria-label="Trail color" />
      </SettingsSection>
    );
  }

  render(<EndDisclosureSection />);
  const toggle = screen.getByRole('button', { name: 'Gesture appearance' });
  expect(toggle.lastElementChild?.tagName.toLowerCase()).toBe('svg');
  fireEvent.click(screen.getByText('Gesture appearance'));
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByLabelText('Trail color')).toBeVisible();
});
