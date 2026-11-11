import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { hasWebDavRelayAttachmentsToSend } from '../../../../../lib/core/sync/webDavRelayAttachments';
import { hasWebDavRelayBodyToSend } from '../../../../../lib/core/sync/webDavRelayBodyOutbox';
import { readWebDavRelayBodyScope } from '../../../../../lib/core/sync/webDavRelayBodyScope';
import { isWebDavRelayReceiveDue } from '../../../../../lib/core/sync/webDavRelayReceiveFreshness';
import { sameWebDavAttachmentPolicy, webDavRelayBindingSchema, type WebDavRelayBinding } from '../../../../../lib/platform/webDavRelayContract';
import { getCompanionRuntimeCapability } from '../../companionRuntimeCapabilities';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

const KEY = 'webdav_relay_binding';
const listeners = new Set<() => void>();

async function identity(db: DbPort) {
  return (await db.query<DbRow & { group_id: string; local_device_identity_key: string }>(
    "SELECT group_id, local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'"
  ))[0];
}

function matches(binding: WebDavRelayBinding, local: Awaited<ReturnType<typeof identity>>) {
  return binding.group_id === local?.group_id && binding.phone_device_id === local.local_device_identity_key;
}

async function readBinding(db: DbPort) {
  const row = (await db.query<DbRow & { value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?', [KEY]))[0];
  return row ? webDavRelayBindingSchema.safeParse(JSON.parse(row.value)).data ?? null : null;
}

export function subscribeCompanionWebDavRelay(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function loadCompanionWebDavRelay(pendingOnly = false, foregroundReceive?: true) {
  if (getCompanionRuntimeCapability().kind !== 'android-native') return null;
  return getIosCompanionDatabaseOwner().read(async db => {
    const binding = await readBinding(db);
    if (!binding || !matches(binding, await identity(db))) return null;
    if (!pendingOnly && !foregroundReceive) return binding;
    const scope = await readWebDavRelayBodyScope(db, binding, binding.phone_device_id);
    if (foregroundReceive) return scope && await isWebDavRelayReceiveDue(db, scope.receiveScope) ? binding : null;
    return scope && (await hasWebDavRelayBodyToSend(db, scope) || await hasWebDavRelayAttachmentsToSend(db, scope))
      ? binding : null;
  });
}

export async function receiveCompanionWebDavRelay(binding: WebDavRelayBinding | undefined, peer: string) {
  if (!binding || binding.desktop_device_id !== peer || getCompanionRuntimeCapability().kind !== 'android-native') return;
  const result = await getIosCompanionDatabaseOwner().runWriter(db => db.transaction(async tx => {
    const local = await identity(tx);
    if (!matches(binding, local)) return null;
    const previous = await readBinding(tx);
    if (previous && matches(previous, local)) {
      if (previous.id !== binding.id || previous.desktop_device_id !== binding.desktop_device_id ||
          previous.directory_url !== binding.directory_url ||
          sameWebDavAttachmentPolicy(previous.attachment_policy, binding.attachment_policy)) {
        return { id: previous.id, changed: false };
      }
    }
    await tx.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [KEY, JSON.stringify(binding), new Date().toISOString()]);
    return { id: binding.id, changed: true };
  }));
  if (result?.changed) for (const listener of listeners) listener();
  return result?.id === binding.id ? result.id : undefined;
}
