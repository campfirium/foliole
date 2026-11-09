import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { COMPANION_LEARNING_SETTING_FIELDS } from './companionLearningSettingFields';

const rowTitles: Record<string, string> = {
  'Maximum interval days': 'Maximum interval',
  'Reading queue mix ratio': 'Reading vs review mix',
  'Review item queue mix ratio': 'Reading vs review mix',
  'Later delay (days)': 'Later delay',
  'Reading initial interval days': 'Reading initial interval',
  'Reading growth factor min': 'Reading interval growth',
  'Reading growth factor max': 'Reading interval growth'
};

export async function openLearningSetting(label: string) {
  if (!screen.queryByRole('dialog')) {
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${rowTitles[label] ?? label}`) }));
  }
  return screen.findByRole(['New day starts at', 'Default topic priority'].includes(label) ? 'combobox' : 'spinbutton', { name: label });
}

export async function changeLearningSetting(label: string, value: string) {
  const input = await openLearningSetting(label);
  const key = input.getAttribute('name');
  const field = COMPANION_LEARNING_SETTING_FIELDS.find(candidate => candidate.key === key)!;
  fireEvent.change(input, { target: { value } });
  if (input instanceof HTMLInputElement) fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(field.read(getCurrentReviewSchedulerSettings())).toBe(Number(value)));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}
