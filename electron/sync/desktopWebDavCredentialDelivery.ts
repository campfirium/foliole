import { randomUUID } from 'node:crypto';

import type {
  WebDavCredentialDelivery, WebDavCredentialEnvelope, WebDavCredentialOffer, WebDavCredentialReply
} from '../../lib/platform/webDavCredentialDeliveryContract.js';
import { registerDatabaseConnectionCleanup, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import {
  createWebDavCredentialKey, matchesWebDavCredentialProof, sealWebDavCredentials, webDavCredentialKeys, webDavCredentialProof
} from './desktopWebDavCredentialCrypto.js';
import { loadDesktopWebDavCredentialDraft, verifyCredentialOwner } from './desktopWebDavCredentialSettings.js';
import { activateAuthenticatedWebDavBinding, prepareAuthenticatedWebDavBinding } from './desktopWebDavRelaySettings.js';
import { testWebDavRelayConnection } from './testWebDavRelayConnection.js';

type Pending = {
  offer: WebDavCredentialOffer;
  key: ReturnType<typeof createWebDavCredentialKey>;
  owner: Awaited<ReturnType<typeof loadDesktopWebDavCredentialDraft>>['owner'];
  expiresAt: number;
  phoneKey?: string;
  keys?: ReturnType<typeof webDavCredentialKeys>;
  phoneConfirmed?: boolean;
  envelope?: WebDavCredentialEnvelope;
};

let pending: Pending | undefined;
const lifetimeMs = 300_000;

function current(groupId: string, phoneId?: string) {
  const value = pending;
  if (!value || value.expiresAt <= Date.now() || value.offer.binding.group_id !== groupId ||
    (phoneId !== undefined && value.offer.binding.phone_device_id !== phoneId)) return undefined;
  return value;
}

function wake() {
  desktopSyncChangeSessions().changed();
  notifyDesktopSyncGroupOverviewChanged();
}

function reset() {
  pending = undefined;
}

export async function beginDesktopWebDavCredentialDelivery(groupId: string, phoneId: string) {
  const { draft, owner } = await loadDesktopWebDavCredentialDraft(groupId);
  await runWithDatabaseConnectionOwner(() => {
    verifyCredentialOwner(owner, groupId);
    const { binding, epoch, version } = prepareAuthenticatedWebDavBinding(groupId, phoneId, draft.directory, true);
    const key = createWebDavCredentialKey();
    pending = { offer: { id: randomUUID(), binding, library_epoch: epoch, version, desktop_key: key.publicKey },
      key, owner, expiresAt: Date.now() + lifetimeMs };
    registerDatabaseConnectionCleanup(reset);
    wake();
  });
  return null;
}

export function desktopWebDavCredentialDeliveryStatus(groupId: string) {
  const value = current(groupId);
  if (!value) return undefined;
  return { id: value.offer.id, device_id: value.offer.binding.phone_device_id, fingerprint: value.keys?.fingerprint,
    desktop_confirmed: Boolean(value.envelope), phone_confirmed: Boolean(value.phoneConfirmed) };
}

export function desktopWebDavCredentialDeliveryForPeer(groupId: string, phoneId: string): WebDavCredentialDelivery | undefined {
  const value = current(groupId, phoneId);
  if (!value) return undefined;
  return { offer: value.offer, ...(value.phoneConfirmed && value.envelope ? { envelope: value.envelope } : {}) };
}

export async function confirmDesktopWebDavCredentialFingerprint(groupId: string, id: string, fingerprint: string,
  credentials: { username: string; password: string }) {
  const value = current(groupId);
  if (!value?.keys || value.offer.id !== id || value.keys.fingerprint !== fingerprint || value.envelope) throw invalid();
  const { draft } = await loadDesktopWebDavCredentialDraft(groupId);
  if (draft.username === credentials.username && draft.password === credentials.password) throw invalid();
  await testWebDavRelayConnection(value.offer.binding.directory_url, { credentials });
  await runWithDatabaseConnectionOwner(() => verifyCredentialOwner(value.owner, groupId));
  if (current(groupId) !== value || value.envelope) throw invalid();
  value.envelope = sealWebDavCredentials(value.keys, credentials);
  wake();
  return null;
}

export function handleDesktopWebDavCredentialReply(groupId: string, phoneId: string, reply: WebDavCredentialReply) {
  const value = current(groupId, phoneId);
  if (!value || value.offer.id !== reply.id || (value.phoneKey && value.phoneKey !== reply.phone_key)) throw invalid();
  const keys = value.keys ?? webDavCredentialKeys(value.offer, reply.phone_key, value.key.privateKey);
  if (reply.receipt) {
    if (!value.phoneConfirmed || !value.envelope ||
      !matchesWebDavCredentialProof(webDavCredentialProof(keys.receipt, 'installed'), reply.receipt)) throw invalid();
    activateAuthenticatedWebDavBinding(value.offer.binding, value.offer.version, value.owner, value.offer.library_epoch);
    reset();
    wake();
    return;
  }
  if (reply.confirmation && !matchesWebDavCredentialProof(webDavCredentialProof(keys.confirmation, 'confirmed'), reply.confirmation)) {
    throw invalid();
  }
  const changed = !value.keys || (reply.confirmation && !value.phoneConfirmed);
  value.keys = keys;
  value.phoneKey = reply.phone_key;
  if (reply.confirmation) value.phoneConfirmed = true;
  if (changed) wake();
}

function invalid() {
  return new Error('webdav_credential_delivery_invalid');
}
