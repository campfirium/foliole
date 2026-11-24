import { pdfTopBarsRecordsSchema } from '../../../../lib/platform/pdfDocumentPreference';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { loadRuntimeAppSettingsState, saveRuntimePdfDocumentPreference } from '../../../shared/platform/appSettingsState';

const key = APP_SETTINGS_STORAGE_KEYS.pdfTopBarsPreferences;

export async function loadPdfTopBarsPreference(fingerprint: string) {
  const settings = await loadRuntimeAppSettingsState();
  if (!settings) throw new Error('PDF top bar settings are unavailable.');
  const records = pdfTopBarsRecordsSchema.parse(JSON.parse(settings[key] ?? '{}'));
  return records[fingerprint] ?? true;
}

export async function savePdfTopBarsPreference(fingerprint: string, enabled: boolean) {
  if (!(await saveRuntimePdfDocumentPreference({ kind: 'topBars', fingerprint, enabled }))) {
    throw new Error('Could not save PDF top bar settings.');
  }
}
