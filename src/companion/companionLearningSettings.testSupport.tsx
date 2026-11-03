import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { COMPANION_LEARNING_SETTING_FIELDS } from './companionLearningSettingFields';

export async function changeLearningSetting(label: string, value: string) {
  const input = await screen.findByLabelText(label);
  fireEvent.change(input, { target: { value } });
  if (input instanceof HTMLInputElement) fireEvent.blur(input);
  const field = COMPANION_LEARNING_SETTING_FIELDS.find(candidate => input.id === `learning-${candidate.key}`)!;
  await waitFor(() => expect(field.read(getCurrentReviewSchedulerSettings())).toBe(Number(value)));
  await waitFor(() => expect(input).not.toBeDisabled());
}
