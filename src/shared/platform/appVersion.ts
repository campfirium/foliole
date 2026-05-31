import { useEffect, useState } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import packageJson from '../../../package.json';

import { getRuntimeInvoke } from './runtimeInvoke';

const FALLBACK_APP_VERSION = packageJson.version;

export function getFallbackAppVersion() {
  return FALLBACK_APP_VERSION;
}

export async function loadAppVersion() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return FALLBACK_APP_VERSION;
  try {
    const version = await runtimeInvoke(NATIVE_COMMANDS.appGetVersion);
    return version.trim() || FALLBACK_APP_VERSION;
  } catch {
    return FALLBACK_APP_VERSION;
  }
}

export function useAppVersion() {
  const [version, setVersion] = useState(FALLBACK_APP_VERSION);

  useEffect(() => {
    let disposed = false;
    void loadAppVersion().then((nextVersion) => {
      if (!disposed) setVersion(nextVersion);
    });
    return () => {
      disposed = true;
    };
  }, []);

  return version;
}
