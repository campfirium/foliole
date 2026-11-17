import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

export function isImportAccessDenied(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /(?:^|: )(?:EACCES:|EPERM:|import_source_access_denied\b)/.test(message);
}

export async function openImportPermissionSettings() {
  await getRuntimeInvoke()?.(NATIVE_COMMANDS.openImportPermissionSettings);
}
