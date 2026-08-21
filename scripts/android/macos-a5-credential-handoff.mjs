import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const CREDENTIALS_SIGNABLE_SCHEMA_VERSION = 1;
export const CREDENTIALS_SIGNABLE_STATE = 'credentials_signable';

const CONTRACT_FILE = 'credentials-signable.json';
const CONTRACT_KEYS = [
  'actionIdentity', 'activeSyncGroupMemberCount', 'credentials',
  'currentMembershipPresent', 'groupId', 'hostName', 'initialSync',
  'localAuthorizationFingerprint',
  'pairingCredentialsPresent',
  'pairingPath', 'peerAuthorizationFingerprint', 'revision', 'schemaVersion', 'state',
  'syncGroupRoutePresent', 'timelineId', 'workgroupKeyPresent',
  'workspaceSyncEndpointPresent'
];

function fail(message = 'Credential handoff evidence is incomplete or contradictory.') {
  throw new Error(message);
}

function exactKeys(value) {
  return value && Object.keys(value).sort().join('\0') === [...CONTRACT_KEYS].sort().join('\0');
}

function fingerprint(value) {
  return /^[0-9a-f]{16}$/u.test(value ?? '');
}

function revision(value) {
  return /^[0-9a-f]{40}$/u.test(value ?? '');
}

export function credentialsSignableEvidencePath(repoRoot) {
  return path.join(repoRoot, '.tmp/artifacts/a5-pair-credentials', CONTRACT_FILE);
}

export function resolveCredentialHandoffRevision(repoRoot, run = spawnSync) {
  const result = run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  const value = String(result.stdout).trim();
  if (result.status !== 0 || !revision(value)) fail('Credential handoff revision is unavailable.');
  return value;
}

export function assertCredentialsSignableContract(value) {
  const valid = exactKeys(value)
    && value.schemaVersion === CREDENTIALS_SIGNABLE_SCHEMA_VERSION
    && value.state === CREDENTIALS_SIGNABLE_STATE
    && value.actionIdentity === 'pair-credentials'
    && revision(value.revision)
    && value.pairingPath === 'new'
    && value.credentials === 'saved_signable'
    && value.initialSync === 'not_started'
    && typeof value.groupId === 'string' && value.groupId.length > 0
    && typeof value.timelineId === 'string' && value.timelineId.length > 0
    && typeof value.hostName === 'string' && value.hostName.trim().length > 0
    && fingerprint(value.localAuthorizationFingerprint)
    && fingerprint(value.peerAuthorizationFingerprint)
    && Number.isSafeInteger(value.activeSyncGroupMemberCount)
    && value.activeSyncGroupMemberCount >= 2 && value.activeSyncGroupMemberCount <= 10_000
    && value.currentMembershipPresent === true
    && value.pairingCredentialsPresent === true
    && value.workspaceSyncEndpointPresent === true
    && value.workgroupKeyPresent === true && value.syncGroupRoutePresent === true;
  if (!valid) fail();
  return value;
}

function assertRecoveryManifest(manifest, readiness) {
  if (manifest?.schemaVersion !== 1 || manifest.action !== 'pair-sync-recover'
      || manifest.resultStatus !== 'success'
      || manifest.localAuthorizationFingerprint !== readiness.localMemberAuthorizationFingerprint
      || typeof manifest.buildIdentity !== 'string' || manifest.buildIdentity.length === 0) {
    fail('Credential recovery manifest does not match the signable state.');
  }
}

function assertSignableReadiness(readiness) {
  const peer = readiness.syncGroupRemotePeerFingerprint;
  if (readiness.existingPairing !== true || readiness.credentialRepairRequired !== false
      || readiness.pairingPeerAuthorizationFingerprint !== peer
      || readiness.pairTargetAuthorizationFingerprint !== peer
      || readiness.pairingPeerConflict === true || readiness.syncGroupPeerConflict === true) {
    fail('Credential readiness does not match the signable state.');
  }
}

function createContract(receipt, readiness, currentRevision) {
  return assertCredentialsSignableContract({
    actionIdentity: 'pair-credentials',
    activeSyncGroupMemberCount: readiness.activeSyncGroupMemberCount,
    credentials: receipt.credentials,
    currentMembershipPresent: true,
    groupId: readiness.syncGroupId,
    hostName: readiness.hostName,
    initialSync: receipt.initialSync,
    pairingCredentialsPresent: readiness.pairingCredentialsPresent,
    pairingPath: receipt.pairingPath,
    localAuthorizationFingerprint: readiness.localMemberAuthorizationFingerprint,
    peerAuthorizationFingerprint: readiness.syncGroupRemotePeerFingerprint,
    revision: currentRevision,
    schemaVersion: CREDENTIALS_SIGNABLE_SCHEMA_VERSION,
    state: CREDENTIALS_SIGNABLE_STATE,
    syncGroupRoutePresent: readiness.syncGroupRoutePresent,
    timelineId: readiness.syncGroupTimelineId,
    workgroupKeyPresent: readiness.workgroupKeyPresent,
    workspaceSyncEndpointPresent: readiness.workspaceSyncEndpointPresent
  });
}

export function produceCredentialsSignableHandoff({
  evidenceRoot, fsApi = fs, readiness, repoRoot,
  currentRevision = resolveCredentialHandoffRevision(repoRoot)
}) {
  const receipt = JSON.parse(fsApi.readFileSync(
    path.join(evidenceRoot, 'pair-sync-recovery-receipt.json'), 'utf8'
  ));
  const manifest = JSON.parse(fsApi.readFileSync(
    path.join(evidenceRoot, 'pair-sync-recovery-manifest.json'), 'utf8'
  ));
  assertSignableReadiness(readiness);
  assertRecoveryManifest(manifest, readiness);
  const contract = createContract(receipt, readiness, currentRevision);
  const evidencePath = credentialsSignableEvidencePath(repoRoot);
  fsApi.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fsApi.writeFileSync(evidencePath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  return contract;
}

export function consumeCredentialsSignableHandoff({
  fsApi = fs, readiness, repoRoot,
  currentRevision = resolveCredentialHandoffRevision(repoRoot)
}) {
  const contract = assertCredentialsSignableContract(JSON.parse(fsApi.readFileSync(
    credentialsSignableEvidencePath(repoRoot), 'utf8'
  )));
  const matches = contract.revision === currentRevision
    && contract.hostName === readiness.hostName
    && contract.localAuthorizationFingerprint === readiness.localMemberAuthorizationFingerprint
    && contract.groupId === readiness.syncGroupId
    && contract.timelineId === readiness.syncGroupTimelineId
    && contract.peerAuthorizationFingerprint === readiness.syncGroupRemotePeerFingerprint
    && contract.activeSyncGroupMemberCount === readiness.activeSyncGroupMemberCount
    && readiness.pairingPeerAuthorizationFingerprint === contract.peerAuthorizationFingerprint
    && readiness.pairingCredentialsPresent === true
    && readiness.workspaceSyncEndpointPresent === true
    && readiness.workgroupKeyPresent === true && readiness.syncGroupRoutePresent === true
    && readiness.existingPairing === true && readiness.credentialRepairRequired === false;
  if (!matches) fail('Credential handoff does not match current pair-sync readiness.');
  return contract;
}
