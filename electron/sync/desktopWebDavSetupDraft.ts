import { z } from 'zod';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import {
  decryptDesktopWebDavCredentialDraft, encryptDesktopWebDavCredentialDraft,
  readDesktopWebDavCredentialCiphertext, replaceDesktopWebDavCredentialCiphertext
} from '../security/desktopWebDavCredentialStore.js';

import { readCredentialOwner, requireActiveGroupKey } from './desktopWebDavCredentialSettings.js';

const setupSchema = z.object({
  address: z.string(), folder: z.string(), username: z.string(), password: z.string().optional()
});

function setupScope(groupId: unknown) {
  return runWithDatabaseConnectionOwner(() => {
    const { scope } = readCredentialOwner(requireActiveGroupKey(groupId));
    return JSON.stringify([scope, 'setup']);
  });
}

async function readSetup(scope: string) {
  const ciphertext = readDesktopWebDavCredentialCiphertext(scope);
  return ciphertext ? decryptDesktopWebDavCredentialDraft(scope, ciphertext) : null;
}

let writes: Promise<unknown> = Promise.resolve();

export async function loadDesktopWebDavSetupDraft(groupId: unknown) {
  if (process.platform !== 'darwin') return null;
  const scope = await setupScope(groupId);
  await writes;
  const draft = await readSetup(scope);
  if (scope !== await setupScope(groupId)) throw new Error('webdav_relay_settings_changed');
  return draft && { address: draft.directory, folder: draft.folder ?? '', username: draft.username,
    has_password: Boolean(draft.password) };
}

export async function saveDesktopWebDavSetupDraft(groupId: unknown, input: unknown) {
  if (process.platform !== 'darwin') return false;
  const draft = setupSchema.parse(input);
  const scope = await setupScope(groupId);
  const pending = writes.then(async () => {
    const prior = draft.password === undefined ? await readSetup(scope) : null;
    const password = draft.password ?? (prior?.directory === draft.address && prior.username === draft.username
      ? prior.password : '');
    const ciphertext = await encryptDesktopWebDavCredentialDraft({
      scope, directory: draft.address, folder: draft.folder, username: draft.username, password
    });
    if (scope !== await setupScope(groupId)) throw new Error('webdav_relay_settings_changed');
    replaceDesktopWebDavCredentialCiphertext(scope, ciphertext);
    return Boolean(password);
  });
  writes = pending.catch(() => undefined);
  return pending;
}

export async function resolveDesktopWebDavSetupPassword(groupId: unknown, address: unknown, username: unknown) {
  const scope = await setupScope(groupId);
  await writes;
  const draft = await readSetup(scope);
  const destination = typeof address === 'string' ? URL.parse(address) : null;
  const saved = draft ? URL.parse(draft.directory) : null;
  if (!draft?.password || draft.username.trim() !== username || !saved || destination?.origin !== saved.origin) {
    throw new Error('webdav_relay_credentials_unavailable');
  }
  if (scope !== await setupScope(groupId)) throw new Error('webdav_relay_settings_changed');
  return draft.password;
}
