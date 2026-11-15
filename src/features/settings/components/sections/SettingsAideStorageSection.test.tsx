import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../../shared/localization/LocalizationProvider';

import { SettingsAideStorageSection } from './SettingsAideStorageSection';

const runtime = vi.hoisted(() => ({
  load: vi.fn(),
  open: vi.fn()
}));

vi.mock('../../../../shared/platform/assistantRuntime', () => ({
  loadAssistantStorageInfo: runtime.load,
  openAssistantStorageLocation: runtime.open
}));

beforeEach(() => {
  window.localStorage.clear();
  runtime.load.mockReset();
  runtime.open.mockReset();
  runtime.open.mockResolvedValue(true);
});

it('shows that Aide data stays on this device and opens its location', async () => {
  runtime.load.mockResolvedValue({
    bytes: 2_621_440,
    complete: true,
    issueCount: 0,
    path: '/device/Foliole/Aide'
  });
  renderSection();

  expect(await screen.findByText('2.5 MB used')).toBeInTheDocument();
  expect(screen.queryByText('/device/Foliole/Aide')).not.toBeInTheDocument();
  expect(screen.getByText(/separately from library backups/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
  expect(runtime.open).toHaveBeenCalledOnce();
});

it('labels a partial inventory without presenting it as exact', async () => {
  runtime.load.mockResolvedValue({
    bytes: 1024,
    complete: false,
    issueCount: 1,
    path: '/device/Foliole/Aide'
  });
  renderSection();

  expect(await screen.findByText('1.0 KB counted; some files could not be measured.')).toBeInTheDocument();
});

it('reports an open-location failure without leaving an unhandled rejection', async () => {
  runtime.load.mockResolvedValue({
    bytes: 0,
    complete: true,
    issueCount: 0,
    path: '/device/Foliole/Aide'
  });
  runtime.open.mockRejectedValue(new Error('open failed'));
  renderSection();

  fireEvent.click(await screen.findByRole('button', { name: 'Open folder' }));
  expect(await screen.findByText('The data location could not be opened.')).toBeInTheDocument();
});

function renderSection() {
  return render(
    <LocalizationProvider initialLanguagePreference="en">
      <SettingsAideStorageSection />
    </LocalizationProvider>
  );
}

it('shows an empty state without displaying the device folder path', async () => {
  runtime.load.mockResolvedValue({
    bytes: 0,
    complete: true,
    issueCount: 0,
    path: '/device/Foliole/Aide'
  });
  renderSection();

  expect(await screen.findByText('No local conversation data')).toBeVisible();
  expect(screen.queryByText('/device/Foliole/Aide')).toBeNull();
  expect(screen.getByRole('button', { name: 'Open folder' })).toBeEnabled();
});
