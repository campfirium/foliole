import { webDavRelayStatus } from '../../../../../lib/core/sync/webDavRelayPublication.js';
import { webDavRelayCredentialReference } from '../../../../../lib/platform/nativeWebDavRelayHttpContract.js';
import type { WebDavCredentialDelivery, WebDavCredentialReply } from '../../../../../lib/platform/webDavCredentialDeliveryContract.js';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository.js';
import { companionFramedFileOwner } from '../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap.js';

import { createCompanionWebDavRelayHttp } from './companionWebDavRelayHttp.js';
import { activateCompanionWebDavCredential, canInstallCompanionWebDavCredential } from './companionWebDavRelayStore.js';
import { currentCompanionFramedSyncFiles } from './framed/companionFramedSyncFiles.js';

type Delivery = {
  id: string;
  fingerprint: string;
  phoneKey: string;
  peer: string;
  confirmed: boolean;
  failed?: boolean;
  send: (reply: WebDavCredentialReply) => Promise<unknown>;
};

let current: Delivery | null = null;
const listeners = new Set<() => void>();

export function companionWebDavCredentialDelivery() { return current; }

export function subscribeCompanionWebDavCredentialDelivery(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function setDelivery(value: Delivery | null) {
  if (current === value) return;
  current = value;
  for (const listener of listeners) listener();
}

export async function confirmCompanionWebDavCredential(fingerprint: string) {
  const delivery = current;
  if (!delivery || delivery.confirmed || delivery.fingerprint !== fingerprint) return;
  const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
  const { confirmation } = await FolioleCompanionSync.confirmWebDavCredentialDelivery({
    ...owner, id: delivery.id, fingerprint
  });
  if (current !== delivery) return;
  // Set the local confirmation before the peer can wake our existing LAN wait.
  const confirmed = { ...delivery, confirmed: true, failed: false };
  setDelivery(confirmed);
  try {
    await delivery.send({ id: delivery.id, phone_key: delivery.phoneKey, confirmation });
  } catch (error) {
    if (current === confirmed) setDelivery(delivery);
    throw error;
  }
}

export async function receiveCompanionWebDavCredentialDelivery(payload: WebDavCredentialDelivery | undefined, peer: string,
  send: Delivery['send'], signal: AbortSignal) {
  if (!payload || !await canInstallCompanionWebDavCredential(payload.offer, peer)) {
    if (current?.peer === peer) setDelivery(null);
    return;
  }
  signal.throwIfAborted();
  const { offer } = payload;
  if (current?.id !== offer.id) {
    const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
    const { phone_key: phoneKey, fingerprint } = await FolioleCompanionSync.prepareWebDavCredentialDelivery({ ...owner, offer });
    signal.throwIfAborted();
    await send({ id: offer.id, phone_key: phoneKey });
    signal.throwIfAborted();
    setDelivery({ id: offer.id, fingerprint, phoneKey, peer, send, confirmed: false });
  }
  if (payload.envelope && current?.id === offer.id && current.confirmed) {
    const delivery = current;
    try {
      await install(payload.offer, payload.envelope, delivery, signal);
    } catch {
      if (current === delivery && !signal.aborted) setDelivery({ ...delivery, confirmed: false, failed: true });
    }
  }
}

async function install(offer: WebDavCredentialDelivery['offer'], envelope: NonNullable<WebDavCredentialDelivery['envelope']>,
  delivery: Delivery, signal: AbortSignal) {
  const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
  const { receipt } = await FolioleCompanionSync.installWebDavCredentialDelivery({ ...owner, id: offer.id, envelope });
  signal.throwIfAborted();
  const binding = { ...offer.binding, credential_version: offer.version };
  const root = binding.directory_url;
  const stats = { requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 };
  const request = createCompanionWebDavRelayHttp(root, currentCompanionFramedSyncFiles(), owner, stats, signal,
    webDavRelayCredentialReference(binding, offer.library_epoch));
  const status = await request(new URL(root), { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus);
  if (status !== 207) throw new Error('webdav_relay_credentials_unavailable');
  signal.throwIfAborted();
  await activateCompanionWebDavCredential(offer, delivery.peer);
  await delivery.send({ id: offer.id, phone_key: delivery.phoneKey, receipt });
  if (current === delivery) setDelivery(null);
}

export function clearCompanionWebDavCredentialDelivery() { setDelivery(null); }
