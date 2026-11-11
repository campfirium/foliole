import { randomUUID, sign } from 'node:crypto';

import {
  matchingWebDavCredentialPeerKey, webDavCredentialRotationChallenge, type WebDavCredentialDelivery,
  type WebDavCredentialEnvelope, type WebDavCredentialOffer, type WebDavCredentialReply
} from '../../lib/platform/webDavCredentialDeliveryContract.js';
import { registerDatabaseConnectionCleanup, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadJsonSetting } from '../database/settingsStore.js';
import { loadOrCreateDesktopWebDavIdentity } from '../security/desktopWebDavIdentityStore.js';

import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import {
  createWebDavCredentialKey, matchesWebDavCredentialProof, sealWebDavCredentials, verifyWebDavDeviceIdentity,
  webDavCredentialKeys, webDavCredentialProof
} from './desktopWebDavCredentialCrypto.js';
import { loadDesktopWebDavCredentialDraft, requireActiveGroupKey, verifyCredentialOwner } from './desktopWebDavCredentialSettings.js';
import { activateAuthenticatedWebDavBinding, prepareAuthenticatedWebDavBinding } from './desktopWebDavRelaySettings.js';
import { testWebDavRelayConnection } from './testWebDavRelayConnection.js';

type Pending = {
  offer: WebDavCredentialOffer;
  key: ReturnType<typeof createWebDavCredentialKey>;
  owner: Awaited<ReturnType<typeof loadDesktopWebDavCredentialDraft>>['owner'];
  expiresAt: number;
  trustedPhoneKey: string | undefined;
  phoneKey?: string;
  phoneIdentityKey?: string | undefined;
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

export async function beginDesktopWebDavCredentialDelivery(groupId: string, phoneId: string, verifyDevice = false) {
  const { draft, owner } = await loadDesktopWebDavCredentialDraft(groupId);
  const identity = await loadOrCreateDesktopWebDavIdentity(owner.scope);
  await runWithDatabaseConnectionOwner(() => {
    verifyCredentialOwner(owner, groupId);
    const { binding, epoch, version } = prepareAuthenticatedWebDavBinding(groupId, phoneId, draft.directory, true);
    const key = createWebDavCredentialKey();
    const offer: WebDavCredentialOffer = { id: randomUUID(), binding, library_epoch: epoch, version, desktop_key: key.publicKey,
      desktop_identity: { public_key: identity.publicKey, library_epoch: owner.libraryEpoch } };
    const savedPin = loadJsonSetting(`${requireActiveGroupKey(groupId)}:credential-peer-identity`);
    const trustedPhoneKey = verifyDevice ? undefined
      : matchingWebDavCredentialPeerKey(savedPin, binding.id, owner.libraryEpoch, epoch);
    if (trustedPhoneKey) {
      offer.desktop_identity_proof = sign('sha256', Buffer.from(webDavCredentialRotationChallenge(offer, trustedPhoneKey)),
        identity.privateKey).toString('base64url');
    }
    pending = { offer, key, owner, trustedPhoneKey, expiresAt: Date.now() + lifetimeMs };
    registerDatabaseConnectionCleanup(reset);
    wake();
  });
  return null;
}

export function desktopWebDavCredentialDeliveryStatus(groupId: string) {
  const value = current(groupId);
  if (!value) return undefined;
  return { id: value.offer.id, device_id: value.offer.binding.phone_device_id, fingerprint: value.trustedPhoneKey ? undefined : value.keys?.fingerprint,
    automatic: Boolean(value.trustedPhoneKey),
    desktop_confirmed: Boolean(value.envelope), phone_confirmed: Boolean(value.phoneConfirmed) };
}

export function desktopWebDavCredentialDeliveryForPeer(groupId: string, phoneId: string): WebDavCredentialDelivery | undefined {
  const value = current(groupId, phoneId);
  if (!value) return undefined;
  return { offer: value.offer, ...(value.phoneConfirmed && value.envelope ? { envelope: value.envelope } : {}) };
}

export async function confirmDesktopWebDavCredentialFingerprint(groupId: string, id: string, fingerprint: string | undefined,
  credentials: { username: string; password: string }) {
  const value = current(groupId);
  if (!value?.keys || value.offer.id !== id || value.envelope) throw invalid();
  if (value.trustedPhoneKey ? fingerprint !== undefined || !value.phoneConfirmed : value.keys.fingerprint !== fingerprint) throw invalid();
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
  if ((value.trustedPhoneKey && value.trustedPhoneKey !== reply.phone_identity_key) ||
    (value.keys && value.phoneIdentityKey !== reply.phone_identity_key)) throw invalid();
  const keys = value.keys ?? webDavCredentialKeys(value.offer, reply.phone_key, value.key.privateKey, reply.phone_identity_key);
  if (!value.keys && reply.phone_identity_key && (!reply.phone_identity_proof ||
    !verifyWebDavDeviceIdentity(reply.phone_identity_key, keys.transcript, reply.phone_identity_proof))) throw invalid();
  if (reply.receipt) {
    if (!value.phoneConfirmed || !value.envelope ||
      !matchesWebDavCredentialProof(webDavCredentialProof(keys.receipt, 'installed'), reply.receipt)) throw invalid();
    activateAuthenticatedWebDavBinding(value.offer.binding, value.offer.version, value.owner, value.offer.library_epoch,
      value.phoneIdentityKey);
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
  value.phoneIdentityKey = reply.phone_identity_key;
  if (reply.confirmation) value.phoneConfirmed = true;
  if (changed) wake();
}

function invalid() {
  return new Error('webdav_credential_delivery_invalid');
}
