import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveAppPaths } from './ipc/paths.js';

export interface DesktopInstallationIdentity {
  deviceName: string;
  installationId: string;
  platform: NodeJS.Platform;
}

const IDENTITY_FILE_NAME = 'desktop-installation.json';

function currentSnapshot(installationId: string): DesktopInstallationIdentity {
  return { deviceName: os.hostname(), installationId, platform: process.platform };
}

function parseIdentity(value: string) {
  const parsed = JSON.parse(value) as Partial<DesktopInstallationIdentity>;
  if (typeof parsed.installationId !== 'string' || !parsed.installationId.trim()) {
    throw new Error('Desktop installation identity is missing installationId.');
  }
  return currentSnapshot(parsed.installationId.trim());
}

function writeIdentity(identityPath: string, identity: DesktopInstallationIdentity) {
  const temporaryPath = `${identityPath}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, identityPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

export function loadOrCreateDesktopInstallationIdentity(
  userDataPath = resolveAppPaths().app_data_dir
): DesktopInstallationIdentity {
  const identityPath = path.join(userDataPath, IDENTITY_FILE_NAME);
  if (fs.existsSync(identityPath)) {
    try {
      const identity = parseIdentity(fs.readFileSync(identityPath, 'utf8'));
      writeIdentity(identityPath, identity);
      return identity;
    } catch {
      fs.renameSync(identityPath, `${identityPath}.corrupt-${Date.now()}`);
    }
  }
  const identity = currentSnapshot(`desktop-installation-${randomUUID()}`);
  writeIdentity(identityPath, identity);
  return identity;
}
