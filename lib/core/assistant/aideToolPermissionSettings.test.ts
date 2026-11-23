import { describe, expect, it } from 'vitest';

import {
  AIDE_READ_BUDGET_MAX,
  createDefaultAideToolPermissionSettings,
  isDefaultAideReadPermissions,
  listAideDisabledToolNames,
  normalizeAideToolPermissionSettings
} from './aideToolPermissionSettings.js';

describe('Aide tool permission settings', () => {
  it('allows every read tool with a 20000-token reply budget by default', () => {
    const defaults = createDefaultAideToolPermissionSettings();
    expect(defaults.readBudget).toBe(20_000);
    expect(Object.values(defaults.read).every(Boolean)).toBe(true);
    expect(listAideDisabledToolNames(defaults)).toEqual([]);
    expect(isDefaultAideReadPermissions(defaults)).toBe(true);
  });

  it('keeps known switches, fills missing ones and clamps the budget', () => {
    const settings = normalizeAideToolPermissionSettings({
      read: { readPdfPage: false, searchLibrary: 'no', unknown: false },
      readBudget: 10_000_000
    });
    expect(settings.read).toMatchObject({ readPdfPage: false, searchLibrary: true });
    expect(settings.readBudget).toBe(AIDE_READ_BUDGET_MAX);
    expect(listAideDisabledToolNames(settings)).toEqual(['read_pdf_page']);
    expect(isDefaultAideReadPermissions(settings)).toBe(false);
  });

  it('maps each switch to its tool', () => {
    const settings = normalizeAideToolPermissionSettings({
      read: { continueReading: false, searchCurrent: false, searchLibrary: false, traceSource: false }
    });
    expect(listAideDisabledToolNames(settings)).toEqual([
      'read_material', 'search_in_material', 'search_materials', 'trace_source'
    ]);
  });
});
