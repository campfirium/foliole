import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsAboutSection } from './SettingsAboutSection';

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = {
    invoke: vi.fn(async () => null) as unknown as NativeInvoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onSearchIndexRebuildStatus: () => () => undefined,
    onWindowResized: () => () => undefined
  };
});

it('keeps the current update check description neutral after a successful check', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify({
    cachedManifest: null,
    cachedReleaseNotes: null,
    dismissedVersion: null,
    lastCheckedAt: '2026-06-05T00:00:00.000Z',
    lastCheckStatus: 'current',
    lastSeenVersion: null,
    latestReleaseUrl: null,
    latestVersion: null
  }));

  renderWithLocalization(<SettingsAboutSection />);

  expect(screen.getByText('Up to date')).toBeInTheDocument();
  expect(screen.getByText('Current Foliole desktop version.')).toBeInTheDocument();
  expect(screen.queryByText('Foliole is up to date.')).not.toBeInTheDocument();
});
