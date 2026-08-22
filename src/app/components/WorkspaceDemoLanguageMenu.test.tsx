import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_LANGUAGE_STORAGE_KEY } from '../../shared/localization/appLanguage';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { WorkspaceDemoLanguageMenu } from './WorkspaceDemoLanguageMenu';

beforeEach(() => window.localStorage.clear());

it('offers System and every supported language and persists an explicit choice', async () => {
  render(
    <LocalizationProvider initialLanguagePreference="en">
      <WorkspaceDemoLanguageMenu />
    </LocalizationProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Language' }));

  expect(await screen.findByRole('menuitem', { name: 'System' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '简体中文' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Deutsch' }));

  expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('de');
});
