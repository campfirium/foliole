import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useFeaturePreviewVisible } from '../../../../shared/config/featurePreviews';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { SettingsPanel } from '../SettingsPanel';
import { renderWithMouseGestureProvider } from '../SettingsPanel.testUtils';

import { SettingsExperimentalFeaturesSection } from './SettingsExperimentalFeaturesSection';

vi.mock('../../../../shared/platform/desktop/searchAliasFile', () => ({
  loadSearchAliasFileStatus: vi.fn(async () => ({ error: null }))
}));

vi.mock('../../../../shared/config/featurePreviews.json', () => ({
  default: {
    webdavSyncSettings: { labelKey: 'settings.companionSync.webdav.title', visibility: 'experimental' },
    internalOnly: { labelKey: 'settings.category.editor.label', visibility: 'internal' },
    publicFeature: { labelKey: 'settings.category.review.label', visibility: 'public' }
  }
}));

function SettingsAndEntries() {
  const showWebDav = useFeaturePreviewVisible('webdavSyncSettings');
  const showInternal = useFeaturePreviewVisible('internalOnly' as Parameters<typeof useFeaturePreviewVisible>[0]);
  const showPublic = useFeaturePreviewVisible('publicFeature' as Parameters<typeof useFeaturePreviewVisible>[0]);
  return (
    <>
      <SettingsExperimentalFeaturesSection />
      {showWebDav && <button type="button">Open WebDAV settings</button>}
      {showInternal && <button type="button">Open internal settings</button>}
      {showPublic && <button type="button">Open public settings</button>}
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv('MODE', 'production');
});

afterEach(() => vi.unstubAllEnvs());

it('opts in to one feature, restores the choice after remount, and can turn it off', () => {
  const view = renderWithLocalization(<SettingsAndEntries />);
  const toggle = () => screen.getByRole('switch', { name: 'WebDAV relay' });
  const webDavEntry = () => screen.queryByRole('button', { name: 'Open WebDAV settings' });

  expect(screen.getAllByRole('switch')).toHaveLength(1);
  expect(toggle()).toHaveAttribute('aria-checked', 'false');
  expect(webDavEntry()).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open internal settings' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open public settings' })).toBeVisible();

  fireEvent.click(toggle());
  expect(toggle()).toHaveAttribute('aria-checked', 'true');
  expect(webDavEntry()).toBeVisible();

  view.unmount();
  renderWithLocalization(<SettingsAndEntries />);
  expect(toggle()).toHaveAttribute('aria-checked', 'true');
  expect(webDavEntry()).toBeVisible();

  fireEvent.click(toggle());
  expect(toggle()).toHaveAttribute('aria-checked', 'false');
  expect(webDavEntry()).not.toBeInTheDocument();
});

it('shows all three stages in an internal build without a saved opt-in', () => {
  vi.stubEnv('MODE', 'internal');
  renderWithLocalization(<SettingsAndEntries />);
  expect(screen.queryByRole('switch', { name: 'WebDAV relay' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open internal settings' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open WebDAV settings' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open public settings' })).toBeVisible();
});

it('offers the experiment in the desktop General settings', () => {
  renderWithMouseGestureProvider(<SettingsPanel onClose={() => undefined} requestedCategory="general" />);
  expect(screen.getByRole('region', { name: 'Experimental features' })).toBeVisible();
  expect(screen.getByRole('switch', { name: 'WebDAV relay' })).toHaveAttribute('aria-checked', 'false');
});
