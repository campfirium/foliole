import { screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { SettingsPanel } from './SettingsPanel';
import {
  createProps,
  renderWithMouseGestureProvider
} from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('renders direct Import content in the right panel instead of a jump button', async () => {
  renderWithMouseGestureProvider(
    <SettingsPanel
      {...createProps()}
      importCategoryContent={<div>Restored import panel content</div>}
      requestedCategory="import"
    />
  );

  expect(screen.getByRole('heading', { level: 2, name: 'Watched folders' })).toBeInTheDocument();
  expect(screen.getByText('Restored import panel content')).toBeInTheDocument();
});

it('renders direct Readwise Reader content in the right panel instead of a jump button', async () => {
  renderWithMouseGestureProvider(
    <SettingsPanel
      {...createProps()}
      readwiseReaderCategoryContent={<div>Restored Readwise Reader content</div>}
      requestedCategory="readwise-reader"
    />
  );

  expect(screen.getByRole('heading', { level: 2, name: 'Readwise Reader' })).toBeInTheDocument();
  expect(screen.getByText('Restored Readwise Reader content')).toBeInTheDocument();
});
