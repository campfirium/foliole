import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { DocumentHeaderMenuSettingsProvider } from '../../context/DocumentHeaderMenuSettingsProvider';

import { SettingsDocumentMenuSection } from './SettingsDocumentMenuSection';

beforeEach(() => {
  window.localStorage.clear();
});

function renderDocumentMenuSettings() {
  renderWithLocalization(
    <DocumentHeaderMenuSettingsProvider>
      <SettingsDocumentMenuSection actionItems={[]} />
    </DocumentHeaderMenuSettingsProvider>
  );
}

it('shows immediate state feedback when a menu separator is toggled', () => {
  renderDocumentMenuSettings();

  const separator = screen.getByRole('button', { name: 'Show separator before Publish to WordPress' });
  expect(separator).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(separator);

  expect(screen.getByRole('button', { name: 'Show separator before Publish to WordPress' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.documentHeaderMenuItems)).toContain('separatorBefore');
});
