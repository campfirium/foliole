import {
  createDecipheriv, createHash, createHmac, createPrivateKey, createPublicKey, diffieHellman, hkdfSync, randomUUID, sign
} from 'node:crypto';
import { createServer } from 'node:http';

import { SYNC_SESSION_PATH, syncSessionReplySchema, type SyncSessionRequest } from '../../lib/platform/syncSessionContract.js';
import {
  webDavCredentialRotationChallenge, webDavCredentialTranscript, type WebDavCredentialEnvelope, type WebDavCredentialOffer
} from '../../lib/platform/webDavCredentialDeliveryContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { handleCompanionSyncSession } from './companionLanSyncSession.js';
import { markDesktopSyncGroupMemberStateReady } from './desktopSyncGroupMemberStateReadiness.js';
import { createWebDavCredentialKey, verifyWebDavDeviceIdentity, webDavCredentialProof } from './desktopWebDavCredentialCrypto.js';
import { loadDesktopBoundWebDavRelay } from './desktopWebDavRelaySettings.js';
import { testWebDavRelayConnection } from './testWebDavRelayConnection.js';
import { decryptDesktopWorkgroupResponse } from './workgroupHttpCrypto.js';
import { enableDesktopWorkgroupKey } from './workgroupKeyStore.js';

function replyFromPhone(offer: WebDavCredentialOffer, encodedIdentity: string) {
  const identity = createPrivateKey({ key: Buffer.from(encodedIdentity, 'base64url'), type: 'pkcs8', format: 'der' });
  const publicKey = createPublicKey(identity).export({ type: 'spki', format: 'der' }).toString('base64url');
  const desktop = offer.desktop_identity;
  if (!desktop || !offer.desktop_identity_proof ||
    !verifyWebDavDeviceIdentity(desktop.public_key, Buffer.from(webDavCredentialRotationChallenge(offer, publicKey)),
      offer.desktop_identity_proof)) throw new Error('Reopened Mac did not prove its saved identity');
  const phone = createWebDavCredentialKey();
  const ephemeral = createPublicKey({ key: Buffer.from(offer.desktop_key, 'base64url'), type: 'spki', format: 'der' });
  const secret = diffieHellman({ privateKey: phone.privateKey, publicKey: ephemeral });
  const transcript = Buffer.from(webDavCredentialTranscript(offer, phone.publicKey, publicKey));
  const salt = createHash('sha256').update(transcript).digest();
  const key = (purpose: string) => Buffer.from(hkdfSync('sha256', secret, salt, `WebDAV credential ${purpose}`, 32));
  const reply = { id: offer.id, phone_key: phone.publicKey, phone_identity_key: publicKey };
  return {
    reply: { ...reply, confirmation: webDavCredentialProof(key('confirmation'), 'confirmed'),
      phone_identity_proof: sign('sha256', transcript, identity).toString('base64url') },
    receipt: { ...reply, receipt: webDavCredentialProof(key('receipt'), 'installed') },
    open(envelope: WebDavCredentialEnvelope) {
      const encrypted = Buffer.from(envelope.ciphertext, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', key('encryption'), Buffer.from(envelope.iv, 'base64url'));
      decipher.setAAD(transcript);
      decipher.setAuthTag(encrypted.subarray(-16));
      return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString()) as {
        username: string; password: string
      };
    }
  };
}

async function withTestPhoneLan<T>(groupId: string, phoneId: string,
  run: (request: (input: SyncSessionRequest) => Promise<{ status: number; body: unknown }>) => Promise<T>) {
  const { group_key: secret } = await runWithDatabaseConnectionOwner(() => enableDesktopWorkgroupKey(groupId));
  markDesktopSyncGroupMemberStateReady(phoneId);
  const server = createServer((request, response) => { void handleCompanionSyncSession(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing LAN fixture address');
    return await run(async input => {
      const method = input.operation === 'wait' ? 'GET' : 'POST';
      const pathWithQuery = `${SYNC_SESSION_PATH}?input=${encodeURIComponent(JSON.stringify(input))}`;
      const timestamp = new Date().toISOString();
      const nonce = randomUUID();
      const bodyHash = createHash('sha256').digest('hex');
      const signature = createHmac('sha256', secret).update([method, pathWithQuery, timestamp, nonce, bodyHash].join('\n')).digest('hex');
      const response = await fetch(`http://127.0.0.1:${address.port}${pathWithQuery}`, { method, headers: {
        'x-sync-group-id': groupId, 'x-device-id': phoneId, 'x-timestamp': timestamp, 'x-nonce': nonce, 'x-signature': signature
      } });
      const buffer = Buffer.from(await response.arrayBuffer());
      const originalType = response.headers.get('x-foliole-original-content-type');
      const plain = originalType ? await runWithDatabaseConnectionOwner(() => decryptDesktopWorkgroupResponse({
        body: buffer, contentType: originalType, groupId, method, pathWithQuery
      })) : buffer;
      return { status: response.status, body: JSON.parse(plain.toString()) as unknown };
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

type LanRequest = Parameters<Parameters<typeof withTestPhoneLan>[2]>[0];

async function connectTestPhone(request: LanRequest, identity: string, desktopKey: string) {
  const open = syncSessionReplySchema.parse((await request({ operation: 'open' })).body);
  const offer = open.webdav_credential_delivery?.offer;
  if (!offer || open.webdav_credential_delivery?.envelope) throw new Error('Queued delivery skipped authentication');
  if (offer.desktop_identity?.public_key !== desktopKey) throw new Error('Mac identity changed across restart');
  const phone = replyFromPhone(offer, identity);
  const rejected = await request({ operation: 'webdavCredential', session: open.session, credential: {
    ...phone.reply, phone_identity_key: createWebDavCredentialKey().publicKey
  } });
  if (rejected.status !== 409) throw new Error('An unpinned phone was accepted');
  const confirm = await request({ operation: 'webdavCredential', session: open.session, credential: phone.reply });
  if (confirm.status !== 200) throw new Error('Phone identity confirmation failed');
  const delivered = syncSessionReplySchema.parse((await request({
    operation: 'wait', session: open.session, marker: open.marker
  })).body).webdav_credential_delivery;
  if (!delivered?.envelope || delivered.offer.id !== offer.id) throw new Error('Queued credentials were not sealed to the phone');
  const credentials = phone.open(delivered.envelope);
  await testWebDavRelayConnection(offer.binding.directory_url, { credentials });
  return { session: open.session, offer, receipt: phone.receipt };
}

export function installQueuedRotationWithTestPhone(groupId: string, phoneId: string, identity: string, desktopKey: string) {
  return withTestPhoneLan(groupId, phoneId, async request => {
    const interrupted = await connectTestPhone(request, identity, desktopKey);
    const previous = await runWithDatabaseConnectionOwner(loadDesktopBoundWebDavRelay);
    await request({ operation: 'close', session: interrupted.session });
    const resumed = await connectTestPhone(request, identity, desktopKey);
    const late = await request({ operation: 'webdavCredential', session: resumed.session, credential: interrupted.receipt });
    const stillActive = await runWithDatabaseConnectionOwner(loadDesktopBoundWebDavRelay);
    const receipt = await request({ operation: 'webdavCredential', session: resumed.session, credential: resumed.receipt });
    const active = await runWithDatabaseConnectionOwner(loadDesktopBoundWebDavRelay);
    return { previous, stillActive, active, late: late.status, installed: receipt.status,
      resumedVersion: resumed.offer.version, resumedWithNewChallenge: resumed.offer.id !== interrupted.offer.id };
  });
}

export async function rejectMacCredentialsWithTestRequest() {
  const { openDatabaseConnection } = await import('../database/connection.js');
  const { withWebDavAuthenticationPause, WebDavAuthenticationError } = await import('../../lib/core/sync/webDavAuthenticationPause.js');
  const { webDavRelayStatus } = await import('../../lib/core/sync/webDavRelayPublication.js');
  const { createDesktopRequestSyncDatabaseHost } = await import('./desktopRequestSyncDatabaseHost.js');
  const { desktopWebDavAuthenticationKey } = await import('./desktopWebDavRelayAuthorization.js');
  const { withDesktopWebDavBasicAuth } = await import('./desktopWebDavBasicAuth.js');
  const { createDesktopWebDavRelayHttp } = await import('./desktopWebDavRelayHttp.js');
  const { notifyDesktopSyncGroupOverviewChanged } = await import('./desktopSyncGroupOverviewNotifier.js');
  const runtime = await runWithDatabaseConnectionOwner(() => {
    const binding = loadDesktopBoundWebDavRelay();
    if (!binding) throw new Error('Expected authenticated binding');
    const key = desktopWebDavAuthenticationKey(binding);
    if (!key) throw new Error('Expected Mac credential revision');
    return { binding, key, databasePath: openDatabaseConnection().dbPath };
  });
  const root = new URL(runtime.binding.directory_url);
  const host = createDesktopRequestSyncDatabaseHost(runtime.databasePath);
  const transport = createDesktopWebDavRelayHttp({ requests: {}, responses: 0, uploadedBytes: 0, downloadedBytes: 0 });
  const request = withDesktopWebDavBasicAuth(transport, root, { username: 'foliole-test-mac', password: 'wrong-password' });
  try {
    await withWebDavAuthenticationPause(host, { key: runtime.key, changed: notifyDesktopSyncGroupOverviewChanged },
      request, undefined, send => send(root, { method: 'PROPFIND', headers: { Depth: '0' } }, webDavRelayStatus));
  } catch (error) {
    if (error instanceof WebDavAuthenticationError && error.status === 401) return runtime.binding.credential_version;
    throw error;
  }
  throw new Error('Test request should receive HTTP 401');
}
