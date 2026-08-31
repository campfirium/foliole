/* global process */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const OWNER = 't152-desktop-dnssd-task-root';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RUNTIME_CHILDREN = ['.tmp', 'artifacts', 'multi-device-sync', 'windows-c'];

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function isInside(parent, child, pathApi) {
  const relative = pathApi.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${pathApi.sep}`) && relative !== '..'
    && !pathApi.isAbsolute(relative));
}

function samePath(left, right, pathApi) {
  const normalizedLeft = pathApi.normalize(left);
  const normalizedRight = pathApi.normalize(right);
  return pathApi === path.win32
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function assertSeparate(left, right, pathApi, label) {
  if (isInside(left, right, pathApi) || isInside(right, left, pathApi)) {
    throw new Error(`T152 task root overlaps ${label}.`);
  }
}

function assertRealChain(directory, fsApi, pathApi) {
  const resolved = pathApi.resolve(directory);
  const canonical = fsApi.realpathSync(resolved);
  if (!samePath(canonical, resolved, pathApi)) {
    throw new Error('T152 task path is not canonical.');
  }
  let cursor = resolved;
  while (true) {
    const item = fsApi.lstatSync(cursor);
    if (!item.isDirectory() || item.isSymbolicLink()) {
      throw new Error('T152 task path contains a link or reparse point.');
    }
    const parent = pathApi.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return canonical;
}

function writeProbe(directory, fsApi, pathApi) {
  const probe = pathApi.join(directory, `.t152-write-${process.pid}`);
  fsApi.writeFileSync(probe, 'owned\n', { encoding: 'utf8', flag: 'wx' });
  fsApi.unlinkSync(probe);
}

function ownerPaths({ baseRoot, evidenceRoot, rootId, sourceRoot }, fsApi, pathApi) {
  if (!UUID.test(rootId ?? '') || !pathApi.isAbsolute(baseRoot ?? '')
      || !pathApi.isAbsolute(evidenceRoot ?? '') || !pathApi.isAbsolute(sourceRoot ?? '')) {
    throw new Error('T152 task-root owner inputs are invalid.');
  }
  const canonicalBaseRoot = assertRealChain(baseRoot, fsApi, pathApi);
  const canonicalEvidenceRoot = assertRealChain(evidenceRoot, fsApi, pathApi);
  const canonicalSourceRoot = assertRealChain(sourceRoot, fsApi, pathApi);
  assertSeparate(canonicalBaseRoot, canonicalEvidenceRoot, pathApi, 'evidence root');
  assertSeparate(canonicalBaseRoot, canonicalSourceRoot, pathApi, 'source root');
  const taskRoot = pathApi.join(canonicalBaseRoot, rootId);
  const runtimeRoot = pathApi.join(taskRoot, ...RUNTIME_CHILDREN);
  return { baseRoot: canonicalBaseRoot, evidenceRoot: canonicalEvidenceRoot,
    libraryRoot: pathApi.join(runtimeRoot, 'client', 'library'), rootId,
    sourceRoot: canonicalSourceRoot, taskRoot, userDataRoot: pathApi.join(runtimeRoot,
      'client', 'user-data') };
}

function receiptClaims(paths, markerPath) {
  return { ...paths, markerPath, owner: OWNER, schemaVersion: 1 };
}

export function createT152DesktopDnsSdLibrary(input, {
  fsApi = fs, pathApi = path
} = {}) {
  const paths = ownerPaths(input, fsApi, pathApi);
  fsApi.mkdirSync(paths.taskRoot, { recursive: false });
  fsApi.mkdirSync(paths.libraryRoot, { recursive: true });
  fsApi.mkdirSync(paths.userDataRoot, { recursive: true });
  for (const root of [paths.taskRoot, paths.libraryRoot, paths.userDataRoot]) {
    assertRealChain(root, fsApi, pathApi);
  }
  writeProbe(paths.taskRoot, fsApi, pathApi);
  const markerPath = pathApi.join(paths.taskRoot, 't152-task-root-owner.json');
  const claims = receiptClaims(paths, markerPath);
  const ownerHash = digest(claims);
  const receipt = { ...claims, ownerHash };
  fsApi.writeFileSync(markerPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx'
  });
  const receiptPath = pathApi.join(paths.evidenceRoot, `t152-task-root-${paths.rootId}.json`);
  fsApi.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx'
  });
  return { ...paths, markerPath, ownerHash, receiptPath };
}

export function verifyT152DesktopDnsSdLibrary(input, receipt, {
  fsApi = fs, pathApi = path
} = {}) {
  const paths = ownerPaths(input, fsApi, pathApi);
  const markerPath = pathApi.join(paths.taskRoot, 't152-task-root-owner.json');
  const claims = receiptClaims(paths, markerPath);
  const ownerHash = digest(claims);
  if (receipt?.ownerHash !== ownerHash || canonicalJson(receipt)
      !== canonicalJson({ ...claims, ownerHash })) {
    throw new Error('T152 task-root owner receipt is invalid.');
  }
  const marker = JSON.parse(fsApi.readFileSync(markerPath, 'utf8'));
  if (canonicalJson(marker) !== canonicalJson(receipt)) {
    throw new Error('T152 task-root owner marker diverged from its receipt.');
  }
  for (const root of [paths.taskRoot, paths.libraryRoot, paths.userDataRoot]) {
    assertRealChain(root, fsApi, pathApi);
  }
  writeProbe(paths.taskRoot, fsApi, pathApi);
  return { ...paths, markerPath, ownerHash };
}

export function assertT152DesktopDnsSdIsolation(owner, protectedRoots, {
  fsApi = fs, pathApi = path
} = {}) {
  if (!Array.isArray(protectedRoots) || protectedRoots.length === 0) {
    throw new Error('T152 protected roots are required.');
  }
  for (const candidate of protectedRoots) {
    if (!pathApi.isAbsolute(candidate ?? '')) throw new Error('T152 protected root is invalid.');
    const canonical = assertRealChain(candidate, fsApi, pathApi);
    assertSeparate(owner.taskRoot, canonical, pathApi, 'protected root');
  }
  return true;
}
