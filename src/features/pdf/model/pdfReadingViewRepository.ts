import { z } from 'zod';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  loadRuntimeAppSettingsState,
  saveRuntimeAppSettingsState
} from '../../../shared/platform/appSettingsState';

import {
  pdfReadingViewSchema,
  DEFAULT_PDF_READING_VIEW,
  type PdfReadingView
} from './pdfReadingView';

const key = APP_SETTINGS_STORAGE_KEYS.pdfDocumentViews;
const recordsSchema = z.record(z.string(), pdfReadingViewSchema);
let writes = Promise.resolve();

function parseRecords(raw: string | undefined) {
  return recordsSchema.parse(JSON.parse(raw ?? '{}'));
}
export async function loadPdfReadingView(fingerprint: string): Promise<PdfReadingView> {
  const settings = await loadRuntimeAppSettingsState();
  if (!settings) throw new Error('PDF view settings are unavailable.');
  return parseRecords(settings[key])[fingerprint] ?? DEFAULT_PDF_READING_VIEW;
}
export function savePdfReadingView(fingerprint: string, view: PdfReadingView): Promise<void> {
  const validated = pdfReadingViewSchema.parse(view);
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      const settings = await loadRuntimeAppSettingsState();
      if (!settings) throw new Error('PDF view settings are unavailable.');
      const records = parseRecords(settings[key]);
      records[fingerprint] = validated;
      if (!(await saveRuntimeAppSettingsState({ ...settings, [key]: JSON.stringify(records) }))) {
        throw new Error('Could not save PDF view settings.');
      }
    });
  writes = write;
  return write;
}
