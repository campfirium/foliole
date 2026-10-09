import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  loadRuntimeAppSettingsState,
  saveRuntimeAppSettingsState
} from '../../../shared/platform/appSettingsState';

import { DEFAULT_PDF_READING_VIEW } from './pdfReadingView';
import { loadPdfReadingView, savePdfReadingView } from './pdfReadingViewRepository';

vi.mock('../../../shared/platform/appSettingsState', () => ({
  loadRuntimeAppSettingsState: vi.fn(),
  saveRuntimeAppSettingsState: vi.fn()
}));
let settings: Record<string, string>;
beforeEach(() => {
  settings = { other: 'preserved' };
  vi.mocked(loadRuntimeAppSettingsState).mockImplementation(async () => settings);
  vi.mocked(saveRuntimeAppSettingsState).mockImplementation(async (next) => {
    settings = next;
    return true;
  });
});
it('remembers automatic and manual ranges independently for each PDF after loading again', async () => {
  const manual = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };
  await savePdfReadingView('first', { mode: 'manual', manual, automatic: manual });
  await savePdfReadingView('second', DEFAULT_PDF_READING_VIEW);
  expect(await loadPdfReadingView('first')).toEqual({ mode: 'manual', manual, automatic: manual });
  await savePdfReadingView('first', { mode: 'auto', manual, automatic: manual });
  expect((await loadPdfReadingView('first')).manual).toEqual(manual);
  expect(await loadPdfReadingView('second')).toEqual(DEFAULT_PDF_READING_VIEW);
  expect(settings.other).toBe('preserved');
});
it('serializes concurrent per-PDF writes without losing either record', async () => {
  await Promise.all(['one', 'two'].map((id) => savePdfReadingView(id, DEFAULT_PDF_READING_VIEW)));
  expect(
    Object.keys(JSON.parse(settings[APP_SETTINGS_STORAGE_KEYS.pdfDocumentViews] ?? '{}'))
  ).toEqual(['one', 'two']);
});
it('reports save failures and refuses to overwrite malformed stored settings', async () => {
  vi.mocked(saveRuntimeAppSettingsState).mockResolvedValueOnce(false);
  await expect(savePdfReadingView('one', DEFAULT_PDF_READING_VIEW)).rejects.toThrow(
    'Could not save'
  );
  settings[APP_SETTINGS_STORAGE_KEYS.pdfDocumentViews] = 'broken';
  await expect(savePdfReadingView('two', DEFAULT_PDF_READING_VIEW)).rejects.toThrow();
  expect(settings[APP_SETTINGS_STORAGE_KEYS.pdfDocumentViews]).toBe('broken');
});
