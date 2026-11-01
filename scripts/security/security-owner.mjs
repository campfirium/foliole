import path from 'node:path';
import { normaliseSecurityObservation } from './security-observation.mjs';
import { digest } from './security-inputs.mjs';
import { readOwnerRecords, writeOwnerRecord } from './security-owner-files.mjs';
import { projectOwnerObservations } from './security-owner-projection.mjs';
import { recordOwnerHealth, projectOwnerHealth } from './security-owner-health.mjs';

export function importSecurityObservation(owner, { rawReport, envelope, rawLock, now, beforeRename }) {
  const role = envelope?.kind === 'ci' ? 'github-artifact-import' : 'local-report-import';
  try {
    const record = normaliseSecurityObservation(rawReport, envelope, rawLock, now);
    const receipt = writeOwnerRecord(path.join(owner, 'observations'), record, { beforeRename });
    recordOwnerHealth(owner, { role, status: 'clean', evidenceAt: new Date(now ?? Date.now()).toISOString() }, now);
    return { ...receipt, observation: record };
  } catch (error) {
    recordOwnerHealth(owner, { role, status: 'error', reason: error.message,
      evidenceAt: new Date(now ?? Date.now()).toISOString() }, now);
    throw error;
  }
}

export function setSecurityDisposition(owner, { finding, versionDigest, riskDigest, status, reason, expiresAt, ownerTask, ownerThread }, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/u.test(finding ?? '') || !/^[a-f0-9]{64}$/u.test(versionDigest ?? '')
    || !/^[a-f0-9]{64}$/u.test(riskDigest ?? '')
    || !['investigating', 'deferred', 'accepted-risk', 'fixed'].includes(status) || !reason?.trim()
    || !(Date.parse(expiresAt) > now && Date.parse(expiresAt) <= now + 192 * 3_600_000)) {
    throw new Error('Disposition requires a finding/version, reason and expiry within eight days');
  }
  if (ownerTask && !/^T\d+(?:-\d+)?$/u.test(ownerTask)
    || ownerThread && !/^[a-f0-9-]{36}$/u.test(ownerThread)) throw new Error('Invalid disposition owner');
  const current = projectSecurityOwner(owner, now).findings.find(value => value.key === finding);
  if (!current || current.versionDigest !== versionDigest || current.riskDigest !== riskDigest || status === 'fixed' && current.active) {
    throw new Error('Disposition does not match current finding/version evidence');
  }
  const record = { schemaVersion: 1, finding, versionDigest, riskDigest, status, reason, expiresAt, ownerTask, ownerThread,
    checkedAt: new Date(now).toISOString() };
  record.id = digest(JSON.stringify(record));
  return writeOwnerRecord(path.join(owner, 'dispositions'), record);
}

export function projectSecurityOwner(owner, now = Date.now()) {
  return projectOwnerObservations(readOwnerRecords(path.join(owner, 'observations')),
    readOwnerRecords(path.join(owner, 'dispositions')), projectOwnerHealth(owner), now);
}
