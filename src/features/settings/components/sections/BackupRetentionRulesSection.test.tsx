import { fireEvent, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { BackupRetentionRulesSection } from './BackupRetentionRulesSection';
import { defaultRetentionStatus, defaultSettings } from './SettingsBackupsSection.testUtils';

function renderRules(overrides: Partial<ComponentProps<typeof BackupRetentionRulesSection>> = {}) {
  const onChangeField = vi.fn();
  const onChangePriority = vi.fn();
  renderWithLocalization(
    <BackupRetentionRulesSection
      draft={defaultSettings}
      isDesktopRuntime
      onChangeField={onChangeField}
      onChangePriority={onChangePriority}
      status={defaultRetentionStatus}
      {...overrides}
    />
  );
  return { onChangeField, onChangePriority };
}

it('shows actual and configured values without a separate manual tier', () => {
  renderRules({
    status: {
      counts: { hourly: 6, daily: 3, weekly: 1, monthly: 0 },
      lastCleanup: null,
      safetyCount: 2,
      totalSizeBytes: 1536 * 1024 * 1024
    }
  });

  expect(screen.getByText('Current')).toBeInTheDocument();
  expect(screen.getByText('Set')).toBeInTheDocument();
  const hourlyRow = screen.getByText('Hourly backups kept').closest('[data-settings-row]');
  expect(hourlyRow).not.toBeNull();
  expect(within(hourlyRow as HTMLElement).getByText('6')).toBeInTheDocument();
  expect(within(hourlyRow as HTMLElement).getByRole('spinbutton')).toHaveValue(8);
  expect(screen.queryByText('Manual backups kept')).not.toBeInTheDocument();
  expect(screen.getByText('Number of hourly backups to keep, including manual backups.')).toBeInTheDocument();
  expect(screen.getByText('1.5')).toBeInTheDocument();
});

it('keeps Safety fixed and reorders ordinary tiers by keyboard or drag', () => {
  const { onChangePriority } = renderRules();
  const safetyRow = screen.getByText('Safety snapshots kept').closest('[data-settings-row]');
  expect(within(safetyRow as HTMLElement).queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();

  fireEvent.keyDown(screen.getByRole('button', { name: 'Move Hourly backups kept' }), { key: 'ArrowDown' });
  expect(onChangePriority).toHaveBeenLastCalledWith(['daily', 'weekly', 'hourly', 'monthly']);

  const transfer = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: 'none',
    getData: (type: string) => transfer.get(type) ?? '',
    setData: (type: string, value: string) => transfer.set(type, value)
  };
  fireEvent.dragStart(screen.getByRole('button', { name: 'Move Monthly backups kept' }), { dataTransfer });
  fireEvent.drop(screen.getByText('Hourly backups kept').closest('[data-settings-row]') as HTMLElement, { dataTransfer });
  expect(onChangePriority).toHaveBeenLastCalledWith(['daily', 'monthly', 'hourly', 'weekly']);
});

it('resets priority and reports cleanup outcomes', () => {
  const { onChangePriority } = renderRules({
    draft: { ...defaultSettings, retention_priority: ['weekly', 'monthly', 'daily', 'hourly'] },
    status: {
      ...defaultRetentionStatus,
      lastCleanup: { failedCount: 1, movedToTrashCount: 3, remainingBytesOverLimit: 512 * 1024 * 1024 }
    }
  });

  expect(screen.getByText(/3 moved to trash in the last cleanup/)).toBeInTheDocument();
  expect(screen.getByText(/1 could not be moved/)).toBeInTheDocument();
  expect(screen.getByText(/0.5 GB still over the limit/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(onChangePriority).toHaveBeenCalledWith(['daily', 'hourly', 'weekly', 'monthly']);
});
