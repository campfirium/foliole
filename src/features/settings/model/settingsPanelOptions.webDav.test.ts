import { afterEach, expect, it, vi } from 'vitest';

import type { Translate } from '../../../shared/localization/LocalizationProvider';

import { getSettingsCategories } from './settingsPanelOptions';

const host = vi.hoisted(() => ({ desktop: true, os: 'macos' }));
vi.mock('../../../shared/platform/runtime', () => ({ isDesktopRuntime: () => host.desktop }));
vi.mock('../../../shared/platform/runtime/operatingSystem', () => ({ resolveRuntimeOperatingSystem: () => host.os }));

const translate: Translate = key => key;
afterEach(() => vi.unstubAllEnvs());

it.each([
  [true, 'macos', true],
  [true, 'windows', false],
  [true, 'other', false],
  [false, 'macos', false]
])('shows the public WebDAV settings only on the supported desktop host (%s, %s)', (desktop, os, visible) => {
  vi.stubEnv('MODE', 'production');
  host.desktop = desktop;
  host.os = os;
  const categories = getSettingsCategories(translate);
  expect(categories.some(category => category.id === 'webdav-sync')).toBe(visible);
  expect(categories.some(category => category.id === 'companion-sync')).toBe(true);
});
