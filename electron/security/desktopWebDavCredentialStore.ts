import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { safeStorage } from 'electron';
import { z } from 'zod';

import { resolveAppPaths } from '../ipc/paths.js';

const draftSchema = z.object({
  scope: z.string(),
  directory: z.string(),
  username: z.string(),
  password: z.string()
});

export type DesktopWebDavCredentialDraft = z.infer<typeof draftSchema>;

function draftPath(scope: string) {
  const digest = createHash('sha256').update(scope).digest('hex');
  return path.join(resolveAppPaths().app_config_dir, 'webdav-credentials', `${digest}.bin`);
}

export function readDesktopWebDavCredentialCiphertext(scope: string) {
  try {
    return readFileSync(draftPath(scope));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    // eslint-disable-next-line preserve-caught-error -- Do not expose the local credential file path.
    throw new Error('webdav_relay_secure_storage_unavailable');
  }
}

export async function encryptDesktopWebDavCredentialDraft(draft: DesktopWebDavCredentialDraft) {
  try {
    if (process.platform !== 'darwin' || !await safeStorage.isAsyncEncryptionAvailable()) {
      throw new Error('webdav_relay_secure_storage_unavailable');
    }
    return await safeStorage.encryptStringAsync(JSON.stringify(draft));
  } catch {
    throw new Error('webdav_relay_secure_storage_unavailable');
  }
}

export async function decryptDesktopWebDavCredentialDraft(scope: string, ciphertext: Buffer) {
  try {
    const { result } = await safeStorage.decryptStringAsync(ciphertext);
    const draft = draftSchema.parse(JSON.parse(result));
    if (draft.scope === scope) return draft;
  } catch {
    // Native and schema errors can contain details that must not cross the bridge.
  }
  throw new Error('webdav_relay_secure_storage_unavailable');
}

export function replaceDesktopWebDavCredentialCiphertext(scope: string, ciphertext: Buffer) {
  const file = draftPath(scope);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    mkdirSync(path.dirname(file), { mode: 0o700, recursive: true });
    writeFileSync(temporary, ciphertext, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file);
  } catch {
    try { rmSync(temporary, { force: true }); }
    catch { /* The abandoned temporary file contains only ciphertext. */ }
    throw new Error('webdav_relay_secure_storage_unavailable');
  }
}
