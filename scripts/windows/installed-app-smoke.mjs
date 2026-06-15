/* global console, process */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { launchDesktopSession } from './playwright-desktop-harness.mjs';

export function resolveInstalledAppSmokeEnv(env = process.env) {
  return {
    ...env,
    FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
    FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1'
  };
}

export function resolveInstalledAppExePath(env = process.env, exists = existsSync) {
  const configuredPath = env.FOLIOLE_ELECTRON_INSTALLED_EXE_PATH?.trim();
  const localAppDataPath = env.LOCALAPPDATA?.trim()
    ? path.win32.join(env.LOCALAPPDATA, 'Programs', 'Foliole', 'Foliole.exe')
    : null;
  const candidatePath = configuredPath || localAppDataPath;
  if (!candidatePath) {
    throw new Error('Set FOLIOLE_ELECTRON_INSTALLED_EXE_PATH or LOCALAPPDATA before installed app smoke.');
  }
  const resolvedPath = path.win32.resolve(candidatePath);
  if (!exists(resolvedPath)) {
    throw new Error(`Installed Foliole executable was not found: ${resolvedPath}`);
  }
  return resolvedPath;
}

export async function runInstalledAppSmoke({
  env = process.env,
  exists = existsSync,
  launchSession = launchDesktopSession
} = {}) {
  const executablePath = resolveInstalledAppExePath(env, exists);
  const smokeEnv = resolveInstalledAppSmokeEnv({
    ...env,
    FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: executablePath
  });
  const session = await launchSession({ env: smokeEnv });
  try {
    return {
      appReady: session.appReady,
      appName: session.snapshot.appName,
      executablePath,
      launchMode: session.target.launchMode
    };
  } finally {
    await session.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('installed-app-smoke.mjs')) {
  const result = await runInstalledAppSmoke();
  console.log(
    `[installed-app-smoke] ok app=${result.appName} mode=${result.launchMode} exe=${result.executablePath}`
  );
}
