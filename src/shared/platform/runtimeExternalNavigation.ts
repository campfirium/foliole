import { normalizeOpenExternalUrl } from '../../../lib/platform/externalUrl';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

const EXTERNAL_URL_WINDOW_FEATURES = 'noopener,noreferrer';

function resolveExternalUrl(target: string) {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return new URL(target, window.location.href).toString();
  } catch {
    return null;
  }
}

export async function openExternalUrl(target: string) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) return;

  const resolvedUrl = resolveExternalUrl(trimmedTarget);
  const externalUrl = resolvedUrl ? normalizeOpenExternalUrl(resolvedUrl) : null;
  if (!externalUrl) return;

  const runtimeInvoke = getRuntimeInvoke();
  if (runtimeInvoke) {
    try {
      await runtimeInvoke(NATIVE_COMMANDS.openExternalUrl, { url: externalUrl });
      return;
    } catch (error) {
      logRuntimeWarning('native external URL open failed', {
        area: 'bridge',
        action: 'open_external_url',
        command: NATIVE_COMMANDS.openExternalUrl,
        fallback: 'window.open',
        target: externalUrl,
        error
      });
    }
  }

  window.open(externalUrl, '_blank', EXTERNAL_URL_WINDOW_FEATURES);
}

export async function openLocalPath(targetPath: string) {
  const trimmedPath = targetPath.trim();
  if (!trimmedPath) return;

  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return;

  try {
    await runtimeInvoke(NATIVE_COMMANDS.openLocalPath, { path: trimmedPath });
  } catch (error) {
    logRuntimeWarning('native local path open failed', {
      area: 'bridge',
      action: 'open_local_path',
      command: NATIVE_COMMANDS.openLocalPath,
      fallback: 'skip_open',
      target: trimmedPath,
      error
    });
  }
}
