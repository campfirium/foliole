import { z } from 'zod';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  loadRuntimeAppSettingsState,
  saveRuntimeAppSettingsState
} from '../../../shared/platform/appSettingsState';

const key = APP_SETTINGS_STORAGE_KEYS.pdfTopBarsPreferences;
const recordsSchema = z.record(z.string(), z.boolean());
let writes = Promise.resolve();

async function readPreferences() {
  const settings = await loadRuntimeAppSettingsState();
  if (!settings) throw new Error('PDF top bar settings are unavailable.');
  return { settings, records: recordsSchema.parse(JSON.parse(settings[key] ?? '{}')) };
}

export async function loadPdfTopBarsPreference(fingerprint: string) {
  const { records } = await readPreferences();
  return records[fingerprint] ?? true;
}

export function savePdfTopBarsPreference(fingerprint: string, enabled: boolean) {
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      const { records } = await readPreferences();
      records[fingerprint] = enabled;
      if (!(await saveRuntimeAppSettingsState({ [key]: JSON.stringify(records) }))) {
        throw new Error('Could not save PDF top bar settings.');
      }
    });
  writes = write;
  return write;
}
