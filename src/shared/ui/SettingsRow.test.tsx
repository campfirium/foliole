import { render, screen } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';

import { preloadTranslationCatalog } from '../localization/translations';

import { SettingsRow } from './SettingsRow';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

it('renders title, description, and control children', () => {
  render(
    <SettingsRow description="Controls the main action." title="Primary shortcut">
      <button type="button">Save</button>
    </SettingsRow>
  );

  expect(screen.getByRole('heading', { level: 4, name: 'Primary shortcut' })).toBeInTheDocument();
  expect(screen.getByText('Controls the main action.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});

it('renders without a description block when description is omitted', () => {
  render(<SettingsRow title="Bare row" />);

  expect(screen.getByRole('heading', { level: 4, name: 'Bare row' })).toBeInTheDocument();
});

it('tags the row with data-settings-row so the section divider selector can match', () => {
  render(<SettingsRow data-testid="row" title="Tagged" />);

  expect(screen.getByTestId('row')).toHaveAttribute('data-settings-row');
  expect(screen.getByTestId('row').className).toContain('min-h-settings-row');
  expect(screen.getByTestId('row').className).toContain('py-settings-panel-y');
});

it('passes through arbitrary div props', () => {
  render(
    <SettingsRow
      data-testid="draggable-row"
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', 'row')}
      title="Draggable row"
    />
  );

  expect(screen.getByTestId('draggable-row')).toHaveAttribute('draggable', 'true');
});

it('dims the row text when readonly is set', () => {
  render(<SettingsRow data-testid="row" readonly title="Readonly" />);

  expect(screen.getByTestId('row').className).toContain('text-foreground/80');
});
