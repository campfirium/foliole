import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { DisplayScaleProvider } from '../../context/DisplayScaleProvider';

import { SettingsDisplayScaleSection } from './SettingsDisplayScaleSection';

beforeEach(() => window.localStorage.clear());

it('previews range input without committing app zoom until native change', () => {
  renderWithLocalization(
    <DisplayScaleProvider>
      <SettingsDisplayScaleSection />
    </DisplayScaleProvider>
  );
  const slider = screen.getByRole('slider');

  fireEvent.input(slider, { target: { value: '130' } });
  expect(slider).toHaveValue('130');
  expect(screen.getByText('130%')).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBeNull();

  fireEvent.change(slider, { target: { value: '130' } });
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBe('130');
});
