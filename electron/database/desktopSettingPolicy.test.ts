import { describe, expect, it } from 'vitest';

import {
  canMaterializeDesktopSetting,
  DESKTOP_INTERNAL_SETTINGS_KEYS,
  resolveDesktopSettingIdentity,
  resolveDesktopSettingPolicy
} from '../../lib/core/database/desktopSettingPolicy.js';

describe('desktop setting policy', () => {
  it.each([
    ['app_settings', 'user_space', true],
    ['backup_settings', 'user_space', true],
    ['import_manager_settings', 'user_space', true],
    ['library_path_settings', 'user_space', true],
    ['review_scheduler_settings', 'user_space', true],
    ['window_state', 'session_resume', true],
    ['readwise_book_epub_picker_state', 'session_resume', true],
    ['discourse_publish_settings', 'host', true],
    ['wordpress_publish_settings', 'host', true],
    ['foliole_publish_settings', 'host', true],
    ['device_id', 'local_only', false],
    ['watch_import_cursor_state', 'local_only', false]
  ])('classifies %s as %s', (key, scope, canonical) => {
    expect(resolveDesktopSettingPolicy(key)).toMatchObject({ canonical, declared: true, scope });
  });

  it('preserves the existing Host scope for undeclared keys without migration eligibility', () => {
    expect(resolveDesktopSettingPolicy('future_setting')).toEqual({
      canonical: true,
      declared: false,
      scope: 'host'
    });
    expect(DESKTOP_INTERNAL_SETTINGS_KEYS).toEqual([
      'workspace_search_queued_revision',
      'workspace_search_source_identity',
      'workspace_search_source_revision'
    ]);
  });

  it('materializes only declared records matching the local desktop identity', () => {
    const identity = resolveDesktopSettingIdentity('app_settings', 'desktop-device');
    expect(identity).not.toBeNull();
    expect(canMaterializeDesktopSetting(identity!, 'desktop-device')).toBe(true);
    expect(canMaterializeDesktopSetting({ ...identity!, platform: 'android' }, 'desktop-device')).toBe(false);
    const session = resolveDesktopSettingIdentity('window_state', 'desktop-device');
    expect(canMaterializeDesktopSetting(session!, 'other-device')).toBe(false);
  });
});
