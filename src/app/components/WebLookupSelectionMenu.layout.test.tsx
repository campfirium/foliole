import { screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WebLookupSelectionMenu } from './WebLookupSelectionMenu';

beforeEach(() => {
  window.localStorage.clear();
});

it('does not render a trailing separator for a single web lookup action', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.webLookupEntries, JSON.stringify([
    { id: 'google', enabled: false },
    { id: 'duckduckgo', enabled: false }
  ]));

  renderWithLocalization(
    <WebLookupSelectionMenu
      documentText="Full topic text"
      left={16}
      onClose={() => undefined}
      selectionPayload={null}
      titleText="My Topic"
      top={24}
    />
  );

  expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Chat with ChatGPT']);
  expect(screen.queryByRole('separator')).toBeNull();
});
