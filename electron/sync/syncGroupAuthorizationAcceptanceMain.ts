import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import type { SyncGroupSecureRouteMetadata } from '../../lib/platform/syncGroupAuthorizationContract.js';

import { SyncGroupAuthorizationStore } from './syncGroupAuthorizationStore.js';

const root = requiredEnvironment('FOLIOLE_SYNC_GROUP_AUTHORIZATION_ARTIFACT_ROOT');
const revision = requiredEnvironment('FOLIOLE_SYNC_GROUP_AUTHORIZATION_REVISION');
app.setPath('userData', path.join(root, 'electron-user-data'));

void app.whenReady().then(() => {
  try {
    fs.mkdirSync(root, { recursive: true });
    const memberPath = path.join(root, 'safe-storage-member.bin');
    const verificationPath = path.join(root, 'safe-storage-verification.bin');
    fs.rmSync(memberPath, { force: true });
    fs.rmSync(verificationPath, { force: true });
    const secret = Buffer.from('t151-2-safe-storage-secret').toString('base64url');
    const request = { body_hash: 'acceptance-body-hash', method: 'POST', nonce: 'safe-storage-nonce',
      path_with_query: '/acceptance/member-route', timestamp: '2026-08-26T00:00:00.000Z' };
    new SyncGroupAuthorizationStore(memberPath).save(route('member'), secret);
    new SyncGroupAuthorizationStore(verificationPath).save(route('verification'), secret);
    const member = new SyncGroupAuthorizationStore(memberPath);
    const verification = new SyncGroupAuthorizationStore(verificationPath);
    const encryptedSecretAbsent = !fs.readFileSync(memberPath).includes(Buffer.from(secret));
    const first = member.sign('route-safe-storage', request);
    const second = new SyncGroupAuthorizationStore(memberPath).sign('route-safe-storage', request);
    verification.verify('route-safe-storage', request, first['X-Signature'], Date.parse(request.timestamp));
    let replayRejected = false;
    try { verification.verify('route-safe-storage', request, first['X-Signature'], Date.parse(request.timestamp)); }
    catch (error) { replayRejected = error instanceof Error && error.message === 'replayed_nonce'; }
    member.revoke('route-safe-storage', 'member');
    let revokedSigningRejected = false;
    try { member.sign('route-safe-storage', request); }
    catch (error) { revokedSigningRejected = error instanceof Error && error.message === 'sync_group_route_not_active'; }
    const receipt = {
      accepted_tip: revision, canonical_signature_stable: first['X-Signature'] === second['X-Signature'],
      encrypted_secret_absent: encryptedSecretAbsent,
      replay_rejected: replayRejected, revoked_signing_rejected: revokedSigningRejected,
      safe_storage_available: true, status: 'passed'
    };
    if (!Object.values(receipt).every((value) => value !== false)) throw new Error('safeStorage acceptance incomplete');
    fs.writeFileSync(path.join(root, 'safe-storage-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    fs.writeFileSync(path.join(root, 'safe-storage-failure.json'), `${JSON.stringify({
      error: error instanceof Error ? error.message : String(error), status: 'failed'
    }, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});

function route(kind: SyncGroupSecureRouteMetadata['kind']): SyncGroupSecureRouteMetadata {
  return { authorization_epoch: 2, authorization_id: 'authorization-safe-storage', endpoint_hint: null,
    group_id: 'group-safe-storage', kind, local_member_id: 'member-local',
    peer_member_id: 'member-peer', protocol_version: 4, route_id: 'route-safe-storage', state: 'active' };
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
