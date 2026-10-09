import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  loadRuntimeAppSettingsState,
  saveRuntimeAppSettingsState
} from '../../../shared/platform/appSettingsState';

import { loadPdfTopBarsPreference, savePdfTopBarsPreference } from './pdfTopBarsPreferences';

vi.mock('../../../shared/platform/appSettingsState', () => ({
  loadRuntimeAppSettingsState: vi.fn(),
  saveRuntimeAppSettingsState: vi.fn()
}));
let settings: Record<string, string>;
beforeEach(() => {
  settings = { 'foliole-pdf-document-views': 'existing ranges' };
  vi.mocked(loadRuntimeAppSettingsState).mockImplementation(async () => settings);
  vi.mocked(saveRuntimeAppSettingsState).mockImplementation(async (next) => {
    settings = { ...settings, ...next };
    return true;
  });
});

it('defaults to enabled and remembers each PDF independently after loading again', async () => {
  expect(await loadPdfTopBarsPreference('one')).toBe(true);
  await savePdfTopBarsPreference('one', false);
  expect(await loadPdfTopBarsPreference('one')).toBe(false);
  expect(await loadPdfTopBarsPreference('two')).toBe(true);
  await savePdfTopBarsPreference('one', true);
  expect(await loadPdfTopBarsPreference('one')).toBe(true);
  expect(settings['foliole-pdf-document-views']).toBe('existing ranges');
});

it('retains both PDFs during concurrent saves', async () => {
  await Promise.all(['one', 'two'].map((id) => savePdfTopBarsPreference(id, false)));
  expect(await loadPdfTopBarsPreference('one')).toBe(false);
  expect(await loadPdfTopBarsPreference('two')).toBe(false);
});

it('reports failed writes and refuses to overwrite malformed saved records', async () => {
  vi.mocked(saveRuntimeAppSettingsState).mockResolvedValueOnce(false);
  await expect(savePdfTopBarsPreference('one', false)).rejects.toThrow('Could not save');
  expect(await loadPdfTopBarsPreference('one')).toBe(true);
  settings[APP_SETTINGS_STORAGE_KEYS.pdfTopBarsPreferences] = 'broken';
  await expect(savePdfTopBarsPreference('one', false)).rejects.toThrow();
  expect(settings[APP_SETTINGS_STORAGE_KEYS.pdfTopBarsPreferences]).toBe('broken');
});
