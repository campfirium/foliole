/* global process, setTimeout */

import { spawnSync } from 'node:child_process';
import {
  mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync
} from 'node:fs';
import path from 'node:path';

export const INTERNAL_QUEUE_QUIET_MS = 60_000;
export const INTERNAL_QUEUE_MAX_MS = 120_000;
const INTERNAL_QUEUE_POLL_MS = 1_000;
const REVISION_PATTERN = /^[0-9a-f]{40}$/u;

function assertRevision(revision) {
  if (!REVISION_PATTERN.test(revision ?? '')) {
    throw new Error('Internal queue requires a full Git revision');
  }
  return revision;
}

function requestDirectory(stateRoot) {
  return path.join(stateRoot, 'requests');
}

export function enqueueInternalRevision(stateRoot, revision, requestedAt = Date.now()) {
  const validatedRevision = assertRevision(revision);
  const directory = requestDirectory(stateRoot);
  mkdirSync(directory, { recursive: true });
  const targetPath = path.join(directory, `${validatedRevision}.json`);
  const temporaryPath = `${targetPath}.${process.pid}.${requestedAt}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({ requestedAt, revision: validatedRevision })}\n`);
  renameSync(temporaryPath, targetPath);
  return targetPath;
}

export function readInternalRequests(stateRoot) {
  const directory = requestDirectory(stateRoot);
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => {
    const requestPath = path.join(directory, entry.name);
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));
    assertRevision(request.revision);
    if (!Number.isFinite(request.requestedAt)) throw new Error('Internal queue request time is invalid');
    return { ...request, requestPath };
  });
}

function latestRequest(requests) {
  return requests.reduce((latest, request) => (
    !latest || request.requestedAt > latest.requestedAt ? request : latest
  ), null);
}

export async function waitForInternalRequests(stateRoot, options = {}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration)));
  const readRequests = options.readRequests ?? readInternalRequests;
  const quietMs = options.quietMs ?? INTERNAL_QUEUE_QUIET_MS;
  const maxMs = options.maxMs ?? INTERNAL_QUEUE_MAX_MS;
  const pollMs = options.pollMs ?? INTERNAL_QUEUE_POLL_MS;
  while (true) {
    const requests = readRequests(stateRoot);
    if (requests.length === 0) return [];
    const oldestAt = Math.min(...requests.map((request) => request.requestedAt));
    const newestAt = latestRequest(requests).requestedAt;
    const readyAt = Math.min(newestAt + quietMs, oldestAt + maxMs);
    const remainingMs = readyAt - now();
    if (remainingMs <= 0) return requests;
    await sleep(Math.min(remainingMs, pollMs));
  }
}

function isAncestor(repositoryRoot, ancestor, descendant, run) {
  return run('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd: repositoryRoot
  }).status === 0;
}

export function resolveLatestInternalRequest(requests, repositoryRoot, run = spawnSync) {
  return requests.reduce((latest, request) => {
    if (!latest || latest.revision === request.revision) {
      return !latest || request.requestedAt >= latest.requestedAt ? request : latest;
    }
    if (isAncestor(repositoryRoot, latest.revision, request.revision, run)) return request;
    if (isAncestor(repositoryRoot, request.revision, latest.revision, run)) return latest;
    return request.requestedAt >= latest.requestedAt ? request : latest;
  }, null);
}

export function clearInternalRequests(stateRoot, accountedAt) {
  for (const request of readInternalRequests(stateRoot)) {
    if (request.requestedAt <= accountedAt) rmSync(request.requestPath, { force: true });
  }
}
