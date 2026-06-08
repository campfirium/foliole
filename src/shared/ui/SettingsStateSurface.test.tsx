import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';

import { preloadTranslationCatalog } from '../localization/translations';

import { SettingsEmptyState, SettingsErrorState, SettingsLoadingState, SettingsStateAction } from './SettingsStateSurface';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

it('marks settings empty, loading, and error surfaces with shared state tones', () => {
  render(
    <>
      <SettingsEmptyState description="No backups yet." title="No backups" />
      <SettingsLoadingState />
      <SettingsErrorState description="Try again." title="Backup failed" />
    </>
  );

  expect(screen.getAllByRole('status')[1]).toHaveAttribute('data-state-surface-tone', 'loading');
  expect(screen.getByText('No backups').closest('[data-settings-state-surface]')).toHaveAttribute('data-state-surface-tone', 'empty');
  expect(screen.getByText('No backups').closest('[data-settings-state-surface]')?.className).toContain('min-h-settings-row');
  expect(screen.getByText('No backups').closest('[data-settings-state-surface]')?.className).toContain('px-settings-panel-x');
  expect(screen.getByText('Backup failed').closest('[data-settings-state-surface]')).toHaveAttribute('data-state-surface-tone', 'error');
  expect(screen.getByText('Backup failed').className).toContain('text-error');
});

it('supports loading copy and settings state actions', () => {
  const onClick = vi.fn();

  render(
    <SettingsLoadingState
      description="Checking local files."
      title="Loading backups"
      className="rounded-md"
    />
  );
  render(<SettingsStateAction label="Retry" onClick={onClick} />);

  expect(screen.getByText('Loading backups').closest('[data-settings-state-surface]')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText('Loading backups').className).toContain('text-foreground');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});
