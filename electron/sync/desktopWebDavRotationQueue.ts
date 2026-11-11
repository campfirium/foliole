import { z } from 'zod';

import { webDavRelayLanBindingSchema } from '../../lib/platform/webDavRelayContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import {
  decryptDesktopWebDavCredentialDraft, encryptDesktopWebDavCredentialDraft,
  readDesktopWebDavCredentialCiphertext, removeDesktopWebDavCredentialCiphertext, replaceDesktopWebDavCredentialCiphertext
} from '../security/desktopWebDavCredentialStore.js';

import type { readCredentialOwner } from './desktopWebDavCredentialSettings.js';

const rotationSchema = z.object({
  id: z.uuid(),
  binding: webDavRelayLanBindingSchema,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  libraryEpoch: z.string(),
  phoneEpoch: z.string(),
  phoneKey: z.string()
});

export type DesktopWebDavRotation = z.infer<typeof rotationSchema>;
type CredentialOwner = ReturnType<typeof readCredentialOwner>;
type Credentials = { username: string; password: string };

export function readDesktopWebDavRotation(key: string) {
  return rotationSchema.safeParse(loadJsonSetting(`${key}:credential-queued`)).data;
}

function fileScope(owner: CredentialOwner) {
  return JSON.stringify(['webdav-phone-rotation', owner.scope]);
}

function valueScope(owner: CredentialOwner, queue: DesktopWebDavRotation) {
  return JSON.stringify([fileScope(owner), queue.id, queue.binding.id, queue.phoneEpoch, queue.version, queue.phoneKey]);
}

export function encryptDesktopWebDavRotation(owner: CredentialOwner, queue: DesktopWebDavRotation, credentials: Credentials) {
  return encryptDesktopWebDavCredentialDraft({
    scope: valueScope(owner, queue), directory: queue.binding.directory_url, ...credentials
  });
}

export function saveDesktopWebDavRotation(key: string, owner: CredentialOwner, queue: DesktopWebDavRotation, ciphertext: Buffer) {
  replaceDesktopWebDavCredentialCiphertext(fileScope(owner), ciphertext);
  saveJsonSetting(`${key}:credential-queued`, queue);
}

export async function loadDesktopWebDavRotationCredentials(owner: CredentialOwner, queue: DesktopWebDavRotation) {
  const ciphertext = readDesktopWebDavCredentialCiphertext(fileScope(owner));
  if (!ciphertext) throw new Error('webdav_relay_credentials_unavailable');
  const credential = await decryptDesktopWebDavCredentialDraft(valueScope(owner, queue), ciphertext);
  if (credential.directory !== queue.binding.directory_url) throw new Error('webdav_relay_scope_changed');
  return credential;
}

export function removeStaleDesktopWebDavRotation(key: string, owner: CredentialOwner, queue: DesktopWebDavRotation) {
  saveJsonSetting(`${key}:credential-queued`, null);
  if (owner.libraryEpoch === queue.libraryEpoch) clearDesktopWebDavRotationCiphertext(owner);
}

export function clearDesktopWebDavRotationCiphertext(owner: CredentialOwner) {
  removeDesktopWebDavCredentialCiphertext(fileScope(owner));
}
