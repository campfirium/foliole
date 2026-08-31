// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { assertT152DesktopDnsSdIsolation, createT152DesktopDnsSdLibrary,
  verifyT152DesktopDnsSdLibrary } from
  './t152-desktop-dnssd-library.mjs';

const ROOT_ID = '11111111-1111-4111-8111-111111111111';

function roots() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 't152-owner-')));
  const values = { baseRoot: path.join(root, 'base'), evidenceRoot: path.join(root, 'evidence'),
    rootId: ROOT_ID, sourceRoot: path.join(root, 'source') };
  for (const value of [values.baseRoot, values.evidenceRoot, values.sourceRoot]) fs.mkdirSync(value);
  return values;
}

it('provisions and verifies one canonical task root with a signed owner receipt', () => {
  const input = roots();
  const created = createT152DesktopDnsSdLibrary(input);
  const receipt = JSON.parse(fs.readFileSync(created.receiptPath, 'utf8'));
  const verified = verifyT152DesktopDnsSdLibrary(input, receipt);
  expect(verified).toMatchObject({ libraryRoot: created.libraryRoot,
    ownerHash: created.ownerHash, taskRoot: created.taskRoot, userDataRoot: created.userDataRoot });
  expect(fs.realpathSync(created.libraryRoot)).toBe(created.libraryRoot);
  expect(assertT152DesktopDnsSdIsolation(verified,
    [input.sourceRoot, input.evidenceRoot])).toBe(true);
});

it('rejects reuse, overlap, UUID drift, receipt edits, and symlinked bases', () => {
  const input = roots();
  const created = createT152DesktopDnsSdLibrary(input);
  const receipt = JSON.parse(fs.readFileSync(created.receiptPath, 'utf8'));
  expect(() => createT152DesktopDnsSdLibrary(input)).toThrow();
  const overlap = roots();
  overlap.baseRoot = overlap.sourceRoot;
  expect(() => createT152DesktopDnsSdLibrary(overlap)).toThrow('overlaps source root');
  expect(() => verifyT152DesktopDnsSdLibrary({ ...input,
    rootId: '22222222-2222-4222-8222-222222222222' }, receipt)).toThrow();
  expect(() => verifyT152DesktopDnsSdLibrary(input, { ...receipt, libraryRoot: input.baseRoot }))
    .toThrow('receipt is invalid');
  expect(() => assertT152DesktopDnsSdIsolation(created, [created.taskRoot]))
    .toThrow('protected root');
  const linked = roots();
  const target = path.join(path.dirname(linked.baseRoot), 'linked-target');
  fs.mkdirSync(target);
  fs.rmdirSync(linked.baseRoot);
  fs.symlinkSync(target, linked.baseRoot, 'dir');
  expect(() => createT152DesktopDnsSdLibrary(linked)).toThrow();
});
