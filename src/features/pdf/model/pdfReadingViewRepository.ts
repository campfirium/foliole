import { pdfReadingViewsSchema } from '../../../../lib/platform/pdfDocumentPreference';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { loadRuntimeAppSettingsState, saveRuntimePdfDocumentPreference } from '../../../shared/platform/appSettingsState';

import { pdfReadingViewSchema, DEFAULT_PDF_READING_VIEW, type PdfReadingView } from './pdfReadingView';

const key = APP_SETTINGS_STORAGE_KEYS.pdfDocumentViews;

export async function loadPdfReadingView(fingerprint: string): Promise<PdfReadingView> {
  const settings = await loadRuntimeAppSettingsState();
  if (!settings) throw new Error('PDF view settings are unavailable.');
  const records = pdfReadingViewsSchema.parse(JSON.parse(settings[key] ?? '{}'));
  return records[fingerprint] ?? DEFAULT_PDF_READING_VIEW;
}

export async function savePdfReadingView(fingerprint: string, view: PdfReadingView): Promise<void> {
  const validated = pdfReadingViewSchema.parse(view);
  if (!(await saveRuntimePdfDocumentPreference({ kind: 'readingView', fingerprint, view: validated }))) {
    throw new Error('Could not save PDF view settings.');
  }
}
