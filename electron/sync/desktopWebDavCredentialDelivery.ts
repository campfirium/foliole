import { randomUUID, sign } from 'node:crypto';

import {
  matchingWebDavCredentialPeerKey, webDavCredentialRotationChallenge, type WebDavCredentialDelivery,
  type WebDavCredentialEnvelope, type WebDavCredentialOffer, type WebDavCredentialReply
} from '../../lib/platform/webDavCredentialDeliveryContract.js';
import { registerDatabaseConnectionCleanup, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadJsonSetting } from '../database/settingsStore.js';
import { hasDesktopWebDavIdentity, loadExistingDesktopWebDavIdentity, loadOrCreateDesktopWebDavIdentity } from '../security/desktopWebDavIdentityStore.js';

import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import {
  createWebDavCredentialKey, matchesWebDavCredentialProof, sealWebDavCredentials, verifyWebDavDeviceIdentity,
  webDavCredentialKeys, webDavCredentialProof
} from './desktopWebDavCredentialCrypto.js';
import { loadDesktopWebDavCredentialDraft, readCredentialOwner, requireActiveGroupKey, verifyCredentialOwner } from './desktopWebDavCredentialSettings.js';
import { activateAuthenticatedWebDavBinding, desktopWebDavAuthenticatedPhoneEpoch,
  loadDesktopBoundWebDavRelay, prepareAuthenticatedWebDavBinding } from './desktopWebDavRelaySettings.js';
import {
  clearDesktopWebDavRotationCiphertext, encryptDesktopWebDavRotation, loadDesktopWebDavRotationCredentials,
  readDesktopWebDavRotation, removeStaleDesktopWebDavRotation, saveDesktopWebDavRotation, type DesktopWebDavRotation
} from './desktopWebDavRotationQueue.js';
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
  queue?: DesktopWebDavRotation;
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

function createDelivery(owner: Pending['owner'], identity: Awaited<ReturnType<typeof loadOrCreateDesktopWebDavIdentity>>,
  candidate: ReturnType<typeof prepareAuthenticatedWebDavBinding>, trustedPhoneKey: string | undefined,
  queue?: DesktopWebDavRotation) {
  const { binding, epoch, version } = candidate;
  const key = createWebDavCredentialKey();
  const offer: WebDavCredentialOffer = { id: randomUUID(), binding, library_epoch: epoch, version, desktop_key: key.publicKey,
    desktop_identity: { public_key: identity.publicKey, library_epoch: owner.libraryEpoch } };
  if (trustedPhoneKey) {
    offer.desktop_identity_proof = sign('sha256', Buffer.from(webDavCredentialRotationChallenge(offer, trustedPhoneKey)),
      identity.privateKey).toString('base64url');
  }
  pending = { offer, key, owner, trustedPhoneKey, expiresAt: Date.now() + lifetimeMs, ...(queue ? { queue } : {}) };
  registerDatabaseConnectionCleanup(reset);
  return pending;
}

function trustedPhone(key: string, candidate: ReturnType<typeof prepareAuthenticatedWebDavBinding>, libraryEpoch: string) {
  return matchingWebDavCredentialPeerKey(loadJsonSetting(`${key}:credential-peer-identity`),
    candidate.binding.id, libraryEpoch, candidate.epoch);
}

export function canQueueDesktopWebDavRotation(groupId: string) {
  const binding = loadDesktopBoundWebDavRelay();
  if (binding?.credential_version === undefined || binding.group_id !== groupId) return false;
  const epoch = desktopWebDavAuthenticatedPhoneEpoch(groupId, binding.phone_device_id);
  if (!epoch) return false;
  const key = requireActiveGroupKey(groupId);
  try {
    const owner = readCredentialOwner(key);
    return hasDesktopWebDavIdentity(owner.scope) &&
      Boolean(trustedPhone(key, { binding, epoch, version: binding.credential_version }, owner.libraryEpoch));
  } catch {
    return false;
  }
}

export async function beginDesktopWebDavCredentialDelivery(groupId: string, phoneId: string, verifyDevice = false) {
  const { draft, owner } = await loadDesktopWebDavCredentialDraft(groupId);
  const existingIdentity = await loadExistingDesktopWebDavIdentity(owner.scope);
  await runWithDatabaseConnectionOwner(async () => {
    verifyCredentialOwner(owner, groupId);
    const key = requireActiveGroupKey(groupId);
    const previous = readDesktopWebDavRotation(key);
    if (previous && isCurrentRotation(key, owner, previous)) throw invalid();
    const offline = !desktopSyncChangeSessions().hasSessions(phoneId);
    if (offline && (verifyDevice || !existingIdentity || !canQueueDesktopWebDavRotation(groupId) ||
      loadDesktopBoundWebDavRelay()?.phone_device_id !== phoneId)) {
      throw new Error('webdav_relay_device_unavailable');
    }
    const candidate = prepareAuthenticatedWebDavBinding(groupId, phoneId, draft.directory, true, offline);
    const pin = verifyDevice || !existingIdentity ? undefined : trustedPhone(key, candidate, owner.libraryEpoch);
    if (offline && !pin) throw new Error('webdav_relay_device_unavailable');
    const identity = existingIdentity ?? await loadOrCreateDesktopWebDavIdentity(owner.scope);
    verifyCredentialOwner(owner, groupId);
    if (previous) removeStaleDesktopWebDavRotation(key, owner, previous);
    createDelivery(owner, identity, candidate, pin);
    wake();
  });
  return null;
}

export function desktopWebDavCredentialDeliveryStatus(groupId: string) {
  const value = current(groupId);
  const key = requireActiveGroupKey(groupId);
  const queue = readDesktopWebDavRotation(key);
  if (queue && isCurrentRotation(key, readCredentialOwner(key), queue)) {
    return { id: queue.id, device_id: queue.binding.phone_device_id, automatic: true, queued: true,
      desktop_confirmed: true, phone_confirmed: Boolean(value?.queue?.id === queue.id && value.phoneConfirmed) };
  }
  if (!value || value.queue) return undefined;
  return { id: value.offer.id, device_id: value.offer.binding.phone_device_id,
    fingerprint: value.trustedPhoneKey ? undefined : value.keys?.fingerprint, automatic: Boolean(value.trustedPhoneKey),
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
  if (!value || value.offer.id !== id || value.envelope || value.queue) throw invalid();
  if (value.trustedPhoneKey ? fingerprint !== undefined : !value.keys || value.keys.fingerprint !== fingerprint) throw invalid();
  const { draft } = await loadDesktopWebDavCredentialDraft(groupId);
  if (draft.username === credentials.username && draft.password === credentials.password) throw invalid();
  await testWebDavRelayConnection(value.offer.binding.directory_url, { credentials });
  if (value.trustedPhoneKey) await queueVerifiedRotation(value, value.trustedPhoneKey, credentials);
  else await runWithDatabaseConnectionOwner(() => {
    assertCurrentDelivery(value);
    value.envelope = sealWebDavCredentials(value.keys!, credentials);
  });
  wake();
  return null;
}

function assertCurrentDelivery(value: Pending) {
  const groupId = value.offer.binding.group_id;
  verifyCredentialOwner(value.owner, groupId);
  if (current(groupId) !== value || value.envelope || value.queue) throw invalid();
}

async function queueVerifiedRotation(value: Pending, phoneKey: string, credentials: { username: string; password: string }) {
  const { id, binding, version, library_epoch: phoneEpoch } = value.offer;
  const queue = { id, binding, version, phoneEpoch, phoneKey, libraryEpoch: value.owner.libraryEpoch };
  const ciphertext = await encryptDesktopWebDavRotation(value.owner, queue, credentials);
  await runWithDatabaseConnectionOwner(() => {
    assertCurrentDelivery(value);
    const key = requireActiveGroupKey(binding.group_id);
    validateQueuedRotation(key, queue);
    saveDesktopWebDavRotation(key, value.owner, queue, ciphertext);
    value.queue = queue;
    if (value.phoneConfirmed && value.keys) value.envelope = sealWebDavCredentials(value.keys, credentials);
  });
}

function validateQueuedRotation(key: string, queue: DesktopWebDavRotation) {
  const { binding, libraryEpoch } = queue;
  const candidate = prepareAuthenticatedWebDavBinding(binding.group_id, binding.phone_device_id, binding.directory_url, false, true);
  if (candidate.binding.id !== binding.id || candidate.version !== queue.version || candidate.epoch !== queue.phoneEpoch ||
    trustedPhone(key, candidate, libraryEpoch) !== queue.phoneKey) throw invalid();
  return candidate;
}

function isCurrentRotation(key: string, owner: Pending['owner'], queue: DesktopWebDavRotation) {
  if (owner.libraryEpoch !== queue.libraryEpoch) return false;
  try { return hasDesktopWebDavIdentity(owner.scope) && Boolean(validateQueuedRotation(key, queue)); }
  catch { return false; }
}

export async function prepareQueuedDesktopWebDavRotation(groupId: string, phoneId: string, newSession: boolean) {
  const key = requireActiveGroupKey(groupId);
  const queue = readDesktopWebDavRotation(key);
  if (!queue || queue.binding.phone_device_id !== phoneId) return;
  const owner = readCredentialOwner(key);
  if (owner.libraryEpoch !== queue.libraryEpoch || !hasDesktopWebDavIdentity(owner.scope)) throw invalid();
  const candidate = validateQueuedRotation(key, queue);
  let value = current(groupId, phoneId);
  if (value?.queue?.id !== queue.id || (newSession && value.phoneKey)) {
    const identity = await loadExistingDesktopWebDavIdentity(owner.scope);
    if (!identity) throw invalid();
    verifyCredentialOwner(owner, groupId);
    value = createDelivery(owner, identity, candidate, queue.phoneKey, queue);
    notifyDesktopSyncGroupOverviewChanged();
  }
  if (value.phoneConfirmed && value.keys && !value.envelope) {
    const credentials = await loadDesktopWebDavRotationCredentials(owner, queue);
    verifyCredentialOwner(owner, groupId);
    value.envelope = sealWebDavCredentials(value.keys, credentials);
  }
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
    if (value.queue) clearDesktopWebDavRotationCiphertext(value.owner);
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
