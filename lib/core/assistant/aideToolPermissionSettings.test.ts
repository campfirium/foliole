import { describe, expect, it } from 'vitest';

import {
  AIDE_READ_BUDGET_MAX,
  AIDE_READ_SCOPE_KEYS,
  createDefaultAideToolPermissionSettings,
  isDefaultAideToolPermissions,
  listAideDisabledToolNames,
  normalizeAideToolPermissionSettings
} from './aideToolPermissionSettings.js';

describe('Aide tool permission settings', () => {
  it('allows every read tool with a 20000-token reply budget by default', () => {
    const defaults = createDefaultAideToolPermissionSettings();
    expect(defaults.readBudget).toBe(20_000);
    expect(Object.values(defaults.read).every(Boolean)).toBe(true);
    expect(Object.values(defaults.write).every(Boolean)).toBe(true);
    expect(defaults.askBeforeWrite).toBe(true);
    expect(listAideDisabledToolNames(defaults)).toEqual([]);
    expect(isDefaultAideToolPermissions(defaults)).toBe(true);
  });

  it('keeps known switches, fills missing ones and clamps the budget', () => {
    const settings = normalizeAideToolPermissionSettings({
      read: { home: 'no', readPdfPage: false, trash: false },
      readBudget: 10_000_000
    });
    expect(settings.read).toEqual({
      baseTopic: true, current: true, dives: true, external: true, folder: true, home: true, trash: false, virtual: true
    });
    expect(settings.readBudget).toBe(AIDE_READ_BUDGET_MAX);
    expect(isDefaultAideToolPermissions(settings)).toBe(false);
  });

  it('leaves every read tool on offer, since read switches name places rather than tools', () => {
    const settings = normalizeAideToolPermissionSettings({
      read: Object.fromEntries(AIDE_READ_SCOPE_KEYS.map((key) => [key, false]))
    });
    expect(listAideDisabledToolNames(settings)).toEqual([]);
  });

  it('maps each modify switch to its group of tools, restoring from trash with moving there', () => {
    const settings = normalizeAideToolPermissionSettings({ write: { manageDives: false, trash: false } });
    expect(listAideDisabledToolNames(settings)).toEqual([
      'delete_material', 'restore_material',
      'create_dive', 'rename_dive', 'add_dive_sources', 'remove_dive_sources'
    ]);
    expect(isDefaultAideToolPermissions(settings)).toBe(false);
    expect(normalizeAideToolPermissionSettings({ read: {} }).write.editContent).toBe(true);
  });

  it('asks before changing unless that is switched off', () => {
    expect(normalizeAideToolPermissionSettings({ askBeforeWrite: 'no' }).askBeforeWrite).toBe(true);
    const off = normalizeAideToolPermissionSettings({ askBeforeWrite: false });
    expect(off.askBeforeWrite).toBe(false);
    expect(isDefaultAideToolPermissions(off)).toBe(false);
  });
});
