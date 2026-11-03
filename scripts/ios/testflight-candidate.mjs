import { readFile } from 'node:fs/promises';

export const IOS_APP_ID = '6818704122';
export const IOS_GROUP_ID = 'dffdd27d-de26-44fb-a864-72fd2c7b5ef7';
export const IOS_INVITATION = 'https://testflight.apple.com/join/PszuhyJA';
const SHA = /^[0-9a-f]{40}$/u;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function createTestflightCandidate({ headSha, acceptedSha, runSha, version, packageVersion,
  runId, buildNumber, ref, executionLane }) {
  const expectedRef = { 'release-t7': 'refs/heads/release', 'qa-mobile-beta': 'refs/heads/check' }[executionLane];
  if (!expectedRef || ref !== expectedRef) throw new Error('iPhone packages require the exact authorized lane and branch');
  if (!SHA.test(headSha) || headSha !== acceptedSha || headSha !== runSha) {
    throw new Error('iPhone source must match this run and its accepted quality SHA');
  }
  if (!VERSION.test(version) || version !== packageVersion) throw new Error('iPhone product version mismatch');
  if (!/^[1-9]\d*$/u.test(runId)) throw new Error('Missing GitHub run identity');
  if (!/^[1-9]\d{0,3}\.\d{1,2}$/u.test(buildNumber ?? '')) {
    throw new Error('Missing or invalid allocated Apple build number');
  }
  return { schemaVersion: 1, sourceSha: headSha, acceptedSha, version, runId, buildNumber };
}

export function verifyTestflightReceipt(receipt, { version, sha } = {}) {
  if (receipt?.schemaVersion !== 1 || !SHA.test(receipt.sourceSha) ||
      receipt.sourceSha !== receipt.acceptedSha || !VERSION.test(receipt.version) ||
      !/^[0-9a-f]{64}$/u.test(receipt.ipaSha256 ?? '') ||
      !/^[1-9]\d{0,3}\.\d{1,2}$/u.test(receipt.buildNumber ?? '') ||
      !/^[1-9]\d*$/u.test(receipt.runId ?? '')) throw new Error('Invalid iPhone release receipt identity');
  if ((version && receipt.version !== version) || (sha && receipt.sourceSha !== sha)) {
    throw new Error('iPhone release receipt does not match the selected candidate');
  }
  if (receipt.appId !== IOS_APP_ID || receipt.groupId !== IOS_GROUP_ID ||
      receipt.channel !== 'testflight' || receipt.invitationUrl !== IOS_INVITATION ||
      typeof receipt.buildId !== 'string' || !/^[A-Za-z0-9-]+$/u.test(receipt.buildId)) {
    throw new Error('Unexpected TestFlight destination');
  }
  if (!['WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW', 'BETA_APPROVED',
    'READY_FOR_BETA_TESTING', 'IN_BETA_TESTING'].includes(receipt.externalBuildState)) {
    throw new Error('iPhone build has not reached external review submission');
  }
  return receipt;
}

export async function verifyTestflightReceiptFile(directory, version, sha) {
  return verifyTestflightReceipt(JSON.parse(await readFile(
    `${directory}/Foliole-iOS-${version}-TestFlight.json`, 'utf8')), { version, sha });
}
