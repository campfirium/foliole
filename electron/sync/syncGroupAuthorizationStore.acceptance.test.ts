// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import type { SyncGroupSecureRouteMetadata } from '../../lib/platform/syncGroupAuthorizationContract.js';

import { SyncGroupAuthorizationStore } from './syncGroupAuthorizationStore.js';

const ROOT = path.resolve('.tmp/artifacts/sync-group-authorization/desktop');
const RECEIPT = path.join(ROOT, 'receipt.json');

it('accepts frozen safeStorage route signing and replay isolation', () => {
  const candidate = candidateRevision();
  fs.mkdirSync(ROOT, { recursive: true });
  const memberPath = path.join(ROOT, 'member-route.bin');
  const verificationPath = path.join(ROOT, 'verification-route.bin');
  fs.rmSync(memberPath, { force: true });
  fs.rmSync(verificationPath, { force: true });
  const secret = Buffer.from('t151-2-acceptance-route-secret', 'utf8').toString('base64url');
  const request = {
    body_hash: 'acceptance-body-hash', method: 'POST', nonce: 'acceptance-nonce',
    path_with_query: '/acceptance/member-route', timestamp: '2026-08-26T00:00:00.000Z'
  };
  const crypto = {
    assertAvailable() {},
    decrypt: (value: Buffer) => Buffer.from(value.toString().slice(3), 'base64').toString(),
    encrypt: (value: string) => Buffer.from(`v1:${Buffer.from(value).toString('base64')}`)
  };
  new SyncGroupAuthorizationStore(memberPath, crypto).save(route('member'), secret);
  new SyncGroupAuthorizationStore(verificationPath, crypto).save(route('verification'), secret);
  const member = new SyncGroupAuthorizationStore(memberPath, crypto);
  const verification = new SyncGroupAuthorizationStore(verificationPath, crypto);
  const first = member.sign('route-acceptance', request);
  const second = new SyncGroupAuthorizationStore(memberPath, crypto).sign('route-acceptance', request);
  verification.verify('route-acceptance', request, first['X-Signature'], Date.parse(request.timestamp));
  let replayRejected = false;
  try { verification.verify('route-acceptance', request, first['X-Signature'], Date.parse(request.timestamp)); }
  catch (error) { replayRejected = error instanceof Error && error.message === 'replayed_nonce'; }
  member.revoke('route-acceptance', 'member');
  let revokedSigningRejected = false;
  try { member.sign('route-acceptance', request); }
  catch (error) { revokedSigningRejected = error instanceof Error && error.message === 'sync_group_route_not_active'; }
  const receipt = {
    accepted_tip: candidate.revision,
    candidate_state: candidate.state,
    canonical_signature_stable: first['X-Signature'] === second['X-Signature'],
    encrypted_secret_absent: !fs.readFileSync(memberPath).includes(Buffer.from(secret)),
    replay_rejected: replayRejected,
    revoked_signing_rejected: revokedSigningRejected,
    status: 'passed'
  };
  expect(receipt).toMatchObject({
    canonical_signature_stable: true, encrypted_secret_absent: true,
    replay_rejected: true, revoked_signing_rejected: true, status: 'passed'
  });
  if (process.env.FOLIOLE_SYNC_GROUP_AUTHORIZATION_ACCEPTANCE === '1') {
    expect(receipt.candidate_state).toBe('frozen');
  }
  fs.writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
});

function route(kind: SyncGroupSecureRouteMetadata['kind']): SyncGroupSecureRouteMetadata {
  return {
    authorization_epoch: 2, authorization_id: 'authorization-acceptance', endpoint_hint: null,
    group_id: 'group-acceptance', kind, local_member_id: 'member-ios',
    peer_member_id: 'member-manager', protocol_version: 4, route_id: 'route-acceptance', state: 'active'
  };
}

function candidateRevision() {
  const head = git(['rev-parse', 'HEAD']).trim();
  if (process.env.FOLIOLE_SYNC_GROUP_AUTHORIZATION_ACCEPTANCE !== '1') {
    return { revision: head, state: 'preflight' } as const;
  }
  if (git(['status', '--porcelain', '--untracked-files=no']).trim()) {
    throw new Error('authorization acceptance requires a clean tracked worktree');
  }
  if (head !== git(['rev-parse', 'origin/dev']).trim()) {
    throw new Error('authorization acceptance requires HEAD == origin/dev');
  }
  return { revision: head, state: 'frozen' } as const;
}

function git(args: string[]) { return execFileSync('git', args, { encoding: 'utf8' }); }
