import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeCommandArgs } from '../../../lib/platform/nativeContract';
import type { PdfDocumentPreference } from '../../../lib/platform/pdfDocumentPreference';

import { getRuntimeInvoke } from './runtimeInvoke';

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') {
      normalized[key] = item;
    }
  }
  return normalized;
}

export async function loadRuntimeAppSettingsState(): Promise<Record<string, string> | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    return toStringRecord(await runtimeInvoke(NATIVE_COMMANDS.loadAppSettingsState));
  } catch {
    return null;
  }
}

export function saveRuntimeAppSettingsState(settings: Record<string, string>) {
  return saveRuntimeSettings({ settings });
}

export function saveRuntimePdfDocumentPreference(pdfPreference: PdfDocumentPreference) {
  return saveRuntimeSettings({ pdfPreference });
}

async function saveRuntimeSettings(args: NativeCommandArgs<typeof NATIVE_COMMANDS.saveAppSettingsState>) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return false;
  }

  try {
    await runtimeInvoke(NATIVE_COMMANDS.saveAppSettingsState, args);
    return true;
  } catch {
    return false;
  }
}
