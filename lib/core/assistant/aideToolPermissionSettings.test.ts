import { describe, expect, it } from 'vitest';

import {
  AIDE_READ_BUDGET_MAX,
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
    expect(listAideDisabledToolNames(defaults)).toEqual([]);
    expect(isDefaultAideToolPermissions(defaults)).toBe(true);
  });

  it('keeps known switches, fills missing ones and clamps the budget', () => {
    const settings = normalizeAideToolPermissionSettings({
      read: { readPdfPage: false, searchLibrary: 'no', unknown: false },
      readBudget: 10_000_000
    });
    expect(settings.read).toMatchObject({ readPdfPage: false, searchLibrary: true });
    expect(settings.readBudget).toBe(AIDE_READ_BUDGET_MAX);
    expect(listAideDisabledToolNames(settings)).toEqual(['read_pdf_page']);
    expect(isDefaultAideToolPermissions(settings)).toBe(false);
  });

  it('maps each switch to its tool', () => {
    const settings = normalizeAideToolPermissionSettings({
      read: { continueReading: false, searchCurrent: false, searchLibrary: false, traceSource: false }
    });
    expect(listAideDisabledToolNames(settings)).toEqual([
      'read_material', 'search_in_material', 'search_materials', 'trace_source'
    ]);
  });

  it('maps each modify switch to its group of tools, restoring from trash with moving there', () => {
    const settings = normalizeAideToolPermissionSettings({ write: { manageDives: false, trash: false } });
    expect(listAideDisabledToolNames(settings)).toEqual([
      'delete_material', 'restore_material',
      'list_dives', 'create_dive', 'rename_dive', 'add_dive_sources', 'remove_dive_sources'
    ]);
    expect(isDefaultAideToolPermissions(settings)).toBe(false);
    expect(normalizeAideToolPermissionSettings({ read: {} }).write.editContent).toBe(true);
  });
});
