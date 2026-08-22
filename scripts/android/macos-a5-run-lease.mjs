/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const LEASE_NAME = 'fixed-a5';
const OWNER_FILE = 'owner.json';

function processStartToken(pid, execute = execFileSync) {
  try {
    const token = execute('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8'
    }).trim();
    if (!token) throw new Error(`Unable to verify process ${pid}.`);
    return token;
  } catch (error) {
    if (error?.status === 1) return null;
    throw error;
  }
}

function isProcessIdentityActive(owner, execute) {
  const currentToken = processStartToken(owner.pid, execute);
  if (currentToken === null) return false;
  return currentToken === owner.processStartToken;
}

function leasePaths(context) {
  const leasePath = path.join(context.leaseRoot, LEASE_NAME);
  return { leasePath, ownerPath: path.join(leasePath, OWNER_FILE) };
}

function readOwner(ownerPath, fsApi) {
  try {
    const owner = JSON.parse(fsApi.readFileSync(ownerPath, 'utf8'));
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0
      || typeof owner.processStartToken !== 'string' || !owner.processStartToken
      || typeof owner.runId !== 'string' || !owner.runId) {
      throw new Error('invalid owner');
    }
    return owner;
  } catch (error) {
    throw new Error(`Mac A5 lease owner is unreadable; refusing recovery: ${error.message}`);
  }
}

function removeOwnedLease(paths, expected, fsApi) {
  const current = readOwner(paths.ownerPath, fsApi);
  if (current.runId !== expected.runId
    || current.processStartToken !== expected.processStartToken
    || current.pid !== expected.pid) {
    throw new Error('Refusing to release a Mac A5 lease owned by another run.');
  }
  const entries = fsApi.readdirSync(paths.leasePath);
  if (entries.length !== 1 || entries[0] !== OWNER_FILE) {
    throw new Error('Refusing to clean a non-empty Mac A5 lease.');
  }
  fsApi.unlinkSync(paths.ownerPath);
  fsApi.rmdirSync(paths.leasePath);
}

function acquireDirectory(paths, fsApi) {
  fsApi.mkdirSync(path.dirname(paths.leasePath), { recursive: true });
  fsApi.mkdirSync(paths.leasePath);
}

export function acquireMacosA5DeviceLease(context, mode, {
  execute = execFileSync, fsApi = fs, pid = process.pid,
  processToken = processStartToken(process.pid, execute)
} = {}) {
  if (!processToken) throw new Error('Unable to identify the Mac A5 controller process.');
  const paths = leasePaths(context);
  try {
    acquireDirectory(paths, fsApi);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const previous = readOwner(paths.ownerPath, fsApi);
    if (isProcessIdentityActive(previous, execute)) {
      throw new Error(
        `Fixed A5 is already owned by run ${previous.runId} (${previous.action}).`
      );
    }
    removeOwnedLease(paths, previous, fsApi);
    acquireDirectory(paths, fsApi);
  }
  const owner = {
    acquiredAt: new Date().toISOString(), action: context.action,
    mode, pid, processStartToken: processToken, runId: context.runId, schemaVersion: 1
  };
  try {
    fsApi.writeFileSync(paths.ownerPath, `${JSON.stringify(owner, null, 2)}\n`, {
      encoding: 'utf8', flag: 'wx'
    });
  } catch (error) {
    fsApi.rmdirSync(paths.leasePath);
    throw error;
  }
  return { ...paths, owner };
}

export function releaseMacosA5DeviceLease(lease, fsApi = fs) {
  removeOwnedLease(lease, lease.owner, fsApi);
}
