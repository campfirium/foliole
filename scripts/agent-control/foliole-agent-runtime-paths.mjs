/* global process */

import os from 'node:os';
import path from 'node:path';

export const FOLIOLE_APP_NAME = 'foliole';
export const FOLIOLE_INTERNAL_APP_NAME = 'foliole-internal';
export const FOLIOLE_INTERNAL_PRODUCT_NAME = 'Foliole Internal';

export function resolveFolioleRuntimeAppName(initialAppName, env = process.env) {
  return env.FOLIOLE_BUILD_CHANNEL === 'internal' || initialAppName === FOLIOLE_INTERNAL_PRODUCT_NAME
    ? FOLIOLE_INTERNAL_APP_NAME
    : FOLIOLE_APP_NAME;
}

/**
 * @param {{ appDataRoot: string, env?: NodeJS.ProcessEnv, internalBuild?: boolean, sandboxRoot?: string | null }} options
 */
export function resolveFolioleUserDataPaths({ appDataRoot, env = process.env, internalBuild = false, sandboxRoot = null }) {
  const defaultUserDataPath = path.join(appDataRoot, internalBuild ? FOLIOLE_INTERNAL_APP_NAME : FOLIOLE_APP_NAME);
  const override = resolvePathOverride(env.FOLIOLE_USER_DATA_PATH);
  return {
    defaultUserDataPath,
    userDataPath: override ?? (sandboxRoot ? path.join(sandboxRoot, 'user-data') : defaultUserDataPath)
  };
}

export function resolveAgentControlDescriptorPath({ env = process.env, platform = process.platform, homeDir = os.homedir() } = {}) {
  const explicit = resolvePathOverride(env.FOLIOLE_AGENT_DESCRIPTOR);
  if (explicit) return explicit;
  const userDataOverride = resolvePathOverride(env.FOLIOLE_USER_DATA_PATH);
  const internalBuild = env.FOLIOLE_BUILD_CHANNEL === 'internal';
  const userDataPath = userDataOverride ?? path.join(resolveAppDataRoot(platform, env, homeDir), internalBuild
    ? FOLIOLE_INTERNAL_APP_NAME
    : FOLIOLE_APP_NAME);
  return path.join(userDataPath, 'cache', 'agent-control-session.json');
}

export function resolvePathOverride(value) {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

function resolveAppDataRoot(platform, env, homeDir) {
  if (platform === 'win32') return env.APPDATA?.trim() || path.join(homeDir, 'AppData', 'Roaming');
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support');
  return env.XDG_CONFIG_HOME?.trim() || path.join(homeDir, '.config');
}
