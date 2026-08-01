import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';

import { SettingsAboutSection } from './SettingsAboutSection';
import { resolveViewStatus } from './SettingsVersionBlock';

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

it('keeps an announced release available after a transient manifest failure', () => {
  const state = {
    cachedManifest: null,
    cachedReleaseNotes: null,
    dismissedVersion: null,
    lastCheckedAt: '2026-08-01T00:00:00.000Z',
    lastCheckStatus: 'failed',
    lastSeenVersion: '0.7.2',
    latestReleaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.7.2',
    latestVersion: '0.7.2'
  } as const;

  expect(resolveViewStatus(state, 'available', false)).toBe('available');
});

it('keeps a native terminal failure distinct from automatic update success', () => {
  const state = {
    cachedManifest: null,
    cachedReleaseNotes: null,
    dismissedVersion: null,
    lastCheckedAt: '2026-08-01T00:00:00.000Z',
    lastCheckStatus: 'available',
    lastSeenVersion: '0.7.3',
    latestReleaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.7.3',
    latestVersion: '0.7.3'
  } as const;

  expect(resolveViewStatus(state, 'error', false)).toBe('released');
});

it('does not claim an automatic update is available on an inapplicable distribution', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify({
    cachedManifest: null,
    cachedReleaseNotes: null,
    dismissedVersion: null,
    lastCheckedAt: '2026-08-01T00:00:00.000Z',
    lastCheckStatus: 'available',
    lastSeenVersion: '0.7.2',
    latestReleaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.7.2',
    latestVersion: '0.7.2'
  }));

  renderWithLocalization(<SettingsAboutSection />);

  expect(screen.getByText('Not checked')).toBeInTheDocument();
  expect(screen.queryByText('Update available')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'View update details' })).toBeInTheDocument();
});
