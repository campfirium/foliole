import { screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('does not expose app language selection in formal settings', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="general" />);

  expect(await screen.findByRole('heading', { level: 2, name: 'General' })).toBeInTheDocument();
  expect(screen.queryByLabelText('App language')).not.toBeInTheDocument();
  expect(screen.queryByText('App language')).not.toBeInTheDocument();
});
