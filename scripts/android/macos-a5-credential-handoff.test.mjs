// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  consumeCredentialsSignableHandoff, credentialsSignableEvidencePath,
  produceCredentialsSignableHandoff
} from './macos-a5-credential-handoff.mjs';
import {
  credentialHandoffRevision, credentialsSignableManifestFixture,
  credentialsSignableReadinessFixture, credentialsSignableReceiptFixture
} from './macos-a5-credential-handoff-fixture.mjs';

const repoRoot = '/repo/foliole';
const evidenceRoot = '/repo/foliole/.tmp/artifacts/a5-pair-credentials/build-credentials';

function memoryFs(receipt = credentialsSignableReceiptFixture,
  manifest = credentialsSignableManifestFixture) {
  const files = new Map([
    [`${evidenceRoot}/pair-sync-recovery-receipt.json`, JSON.stringify(receipt)],
    [`${evidenceRoot}/pair-sync-recovery-manifest.json`, JSON.stringify(manifest)]
  ]);
  return {
    files, mkdirSync: vi.fn(),
    readFileSync: vi.fn((name) => files.get(name)),
    writeFileSync: vi.fn((name, value) => files.set(name, value))
  };
}

function produce(fsApi = memoryFs(), readiness = credentialsSignableReadinessFixture) {
  const contract = produceCredentialsSignableHandoff({
    currentRevision: credentialHandoffRevision, evidenceRoot, fsApi, readiness, repoRoot
  });
  return { contract, fsApi };
}

it('passes one sanitized credentials_signable object from producer to consumer unchanged', () => {
  const { contract, fsApi } = produce();
  const consumed = consumeCredentialsSignableHandoff({
    currentRevision: credentialHandoffRevision, fsApi,
    readiness: credentialsSignableReadinessFixture, repoRoot
  });

  expect(consumed).toEqual(contract);
  expect([...fsApi.files.keys()]).toContain(credentialsSignableEvidencePath(repoRoot));
  expect(JSON.stringify(contract)).not.toMatch(/serial|authorization|private|secret|keyValue/iu);
  expect(contract).toMatchObject({ actionIdentity: 'pair-credentials',
    credentials: 'saved_signable', initialSync: 'not_started', pairingPath: 'new',
    schemaVersion: 1, state: 'credentials_signable' });
});

it.each([
  ['receipt started sync', { receipt: { ...credentialsSignableReceiptFixture,
    initialSync: 'started' } }],
  ['receipt cannot sign', { receipt: { ...credentialsSignableReceiptFixture,
    credentials: 'saved_not_signable' } }],
  ['manifest version', { manifest: { ...credentialsSignableManifestFixture,
    schemaVersion: 2 } }],
  ['manifest identity', { manifest: { ...credentialsSignableManifestFixture,
    deviceIdentityFingerprint: 'ffffffffffffffff' } }],
  ['missing group', { readiness: { ...credentialsSignableReadinessFixture,
    syncGroupId: null } }],
  ['missing endpoint', { readiness: { ...credentialsSignableReadinessFixture,
    workspaceSyncEndpointPresent: false } }],
  ['missing key', { readiness: { ...credentialsSignableReadinessFixture,
    workgroupKeyPresent: false } }],
  ['missing route', { readiness: { ...credentialsSignableReadinessFixture,
    syncGroupRoutePresent: false } }],
  ['pairing path drift', { readiness: { ...credentialsSignableReadinessFixture,
    remotePeerFingerprint: 'ffffffffffffffff' } }],
  ['credential repair', { readiness: { ...credentialsSignableReadinessFixture,
    credentialRepairRequired: true } }]
])('rejects producer contradiction: %s', (_label, change) => {
  const fsApi = memoryFs(change.receipt, change.manifest);
  expect(() => produce(fsApi, change.readiness)).toThrow(/incomplete|manifest|readiness/iu);
  expect(fsApi.writeFileSync).not.toHaveBeenCalled();
});

it.each([
  ['contract version', (contract) => ({ ...contract, schemaVersion: 2 })],
  ['extra field', (contract) => ({ ...contract, diagnostic: true })],
  ['revision', (contract) => contract, 'b'.repeat(40)],
  ['device identity', (contract) => contract, credentialHandoffRevision,
    { deviceIdentityFingerprint: 'ffffffffffffffff' }],
  ['peer identity', (contract) => contract, credentialHandoffRevision,
    { remotePeerFingerprint: 'ffffffffffffffff' }],
  ['member count', (contract) => contract, credentialHandoffRevision,
    { activeSyncGroupMemberCount: 2 }],
  ['current pairing', (contract) => contract, credentialHandoffRevision,
    { existingPairing: false }]
])('rejects consumer contradiction before sync: %s', (
  _label, mutate, currentRevision = credentialHandoffRevision, readinessChange = {}
) => {
  const { contract, fsApi } = produce();
  fsApi.files.set(credentialsSignableEvidencePath(repoRoot), JSON.stringify(mutate(contract)));
  expect(() => consumeCredentialsSignableHandoff({ currentRevision, fsApi, repoRoot,
    readiness: { ...credentialsSignableReadinessFixture, ...readinessChange }
  })).toThrow(/incomplete|does not match/iu);
});
