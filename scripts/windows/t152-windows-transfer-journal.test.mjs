// @vitest-environment node

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
import { Buffer } from 'node:buffer';

import { createControlBundle, createExactControlBundleArchive, localTarArgs, serialTransfers, terminalState,
  validateControlBundleArchive, validateControlBundleReceipt, validateControlBundleTree } from
  './t152-windows-transfer-journal.mjs';

it('classifies unstarted, successful, and failed transport terminals exactly', () => {
  expect(terminalState(null)).toBe('not_started');
  expect(terminalState({ exitCode: 0, signal: null, timedOut: false })).toBe('success');
  expect(terminalState({ exitCode: 255, signal: null, timedOut: false })).toBe('failure');
});

it('forces Windows drive paths to remain local tar operands', () => {
  expect(localTarArgs(['-tf', 'C:\\bundle.tar'], 'win32'))
    .toEqual(['--force-local', '-tf', 'C:\\bundle.tar']);
  expect(localTarArgs(['-tf', '/tmp/bundle.tar'], 'darwin'))
    .toEqual(['-tf', '/tmp/bundle.tar']);
});

it('stops the single transfer stream at its first red terminal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-transfer-'));
  const files = ['one', 'two', 'three'].map((name) => {
    const local = path.join(root, name); fs.writeFileSync(local, name); return { local, remote: name };
  });
  const called = [];
  const receipts = await serialTransfers(files, async (item) => {
    called.push(item.remote);
    return { exitCode: item.remote === 'two' ? 255 : 0, signal: null, timedOut: false };
  });
  expect(called).toEqual(['one', 'two']);
  expect(receipts.map((item) => item.terminalState)).toEqual(['success', 'failure']);
  fs.rmSync(root, { force: true, recursive: true });
});

it('binds one exact file set and manifest into one dynamic control bundle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-bundle-'));
  const files = ['action.ps1', 'runner.mjs'].map((name) => {
    const file = path.join(root, name); fs.writeFileSync(file, name); return file;
  });
  const bundle = createControlBundle({ bundleId: '11111111-1111-4111-8111-111111111111',
    capsuleRoot: path.join(root, 'capsule'), files, remoteBaseRoot: 'X:\\动态 根' });
  expect(bundle.fileFacts.map((item) => item.name)).toEqual(['action.ps1', 'runner.mjs']);
  expect(bundle.remoteRoot).toBe('X:\\动态 根\\t152-control-11111111-1111-4111-8111-111111111111');
  expect(bundle.verification.baseRoot).toBe('X:\\动态 根');
  expect(bundle.verification.bundleSha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(bundle.verificationToken).toMatch(/^[A-Za-z0-9_-]+$/u);
  const envelope = JSON.parse(Buffer.from(bundle.verificationToken, 'base64url').toString('utf8'));
  expect(envelope.verificationJson).toBe(bundle.verificationJson);
  expect(envelope.verificationSha256).toBe(bundle.verificationSha256);
  fs.rmSync(root, { force: true, recursive: true });
});

it('binds missing and tampered verification fields to the canonical request hash', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-bundle-token-'));
  const file = path.join(root, 'action.ps1'); fs.writeFileSync(file, 'candidate');
  const bundle = createControlBundle({ bundleId: '11111111-1111-4111-8111-111111111111',
    capsuleRoot: path.join(root, 'capsule'), files: [file], remoteBaseRoot: 'Q:\\Space 资料' });
  const missing = JSON.parse(bundle.verificationJson); delete missing.bundleRoot;
  expect(JSON.stringify(missing)).not.toBe(bundle.verificationJson);
  const tampered = bundle.verificationJson.replace('11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222');
  expect(tampered).not.toBe(bundle.verificationJson);
  expect(bundle.verificationSha256).toMatch(/^[0-9a-f]{64}$/u);
  fs.rmSync(root, { force: true, recursive: true });
});

it('accepts one exact durable receipt identity and rejects any changed identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-receipt-'));
  const file = path.join(root, 'action.ps1'); fs.writeFileSync(file, 'candidate');
  const bundle = createControlBundle({ bundleId: '11111111-1111-4111-8111-111111111111',
    capsuleRoot: path.join(root, 'capsule'), files: [file], remoteBaseRoot: 'Q:\\Root' });
  const envelope = JSON.parse(Buffer.from(bundle.verificationToken, 'base64url').toString('utf8'));
  const receipt = { archive: { sha256: bundle.verification.bundleSha256 },
    collectionSelfcheck: { caseCount: 5, runtimeType: 'System.Collections.ArrayList',
      state: 'success' }, comparison: {}, failure: null,
    identity: { bundleId: bundle.verification.bundleId,
      bundleSha256: bundle.verification.bundleSha256,
      manifestSha256: bundle.verification.manifestSha256,
      tokenSha256: createHash('sha256').update(bundle.verificationToken).digest('hex'),
      verificationSha256: envelope.verificationSha256 },
    manifest: { sha256: bundle.verification.manifestSha256 },
    root: { path: bundle.verification.bundleRoot }, schemaVersion: 2 };
  expect(validateControlBundleReceipt(receipt, bundle)).toBe(receipt);
  expect(() => validateControlBundleReceipt({ ...receipt,
    root: { path: `${bundle.verification.bundleRoot}-changed` } }, bundle)).toThrow('full receipt');
  for (const key of ['bundleId', 'bundleSha256', 'manifestSha256', 'tokenSha256',
    'verificationSha256']) {
    expect(() => validateControlBundleReceipt({ ...receipt,
      identity: { ...receipt.identity, [key]: `changed-${key}` } }, bundle)).toThrow('identity');
  }
  const early = { ...receipt, archive: null,
    collectionSelfcheck: { caseCount: 0, runtimeType: null, state: 'failure' },
    comparison: null, manifest: null, root: null, failure: { exception: { message: 'failed',
      offsetInLine: 5, positionMessage: 'line 1', scriptLineNumber: 1,
      scriptName: 'candidate.ps1', type: 'RuntimeException' }, messages: ['failed'] } };
  expect(validateControlBundleReceipt(early, bundle)).toBe(early);
  expect(() => validateControlBundleReceipt({ ...early, archive: receipt.archive }, bundle))
    .toThrow('early failure');
  expect(() => validateControlBundleReceipt({ ...receipt, comparison: null }, bundle))
    .toThrow('full receipt');
  expect(() => validateControlBundleReceipt({ ...receipt,
    collectionSelfcheck: { state: 'success' } }, bundle)).toThrow('full receipt');
  expect(() => validateControlBundleReceipt({ ...early,
    failure: { exception: null, messages: ['failed'] } }, bundle)).toThrow('early failure');
  fs.rmSync(root, { force: true, recursive: true });
});

it('collects one durable verification receipt after either action terminal outcome', () => {
  const stages = fs.readFileSync('scripts/windows/t152-windows-prepare-stages.mjs', 'utf8');
  const transfer = fs.readFileSync('scripts/windows/t152-windows-transfer-journal.mjs', 'utf8');
  expect(stages).toContain('verifyAndCollectControlBundle');
  expect(transfer.indexOf("'-Action', 'verify-control-bundle'")).toBeLessThan(
    transfer.indexOf('await collectControlBundleReceipt'));
  expect(stages).toContain("verify.receipt.state !== 'success'");
  expect(stages).toContain('verify.receipt.parsed.failure !== null');
  expect(transfer).toContain('bundle.verificationReceiptPath');
  expect(transfer).not.toMatch(/setInterval|retry|stdout.*receipt/iu);
});

it('excludes macOS metadata from an extended-attribute risk fixture', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-metadata-'));
  const localParent = path.join(root, 'parent'); const directoryName = 'bundle';
  const bundleRoot = path.join(localParent, directoryName); fs.mkdirSync(bundleRoot,
    { recursive: true });
  fs.writeFileSync(path.join(bundleRoot, 'manifest.json'), '{}\n');
  fs.writeFileSync(path.join(bundleRoot, 'payload.mjs'), 'payload\n');
  if (process.platform === 'darwin') {
    fs.writeFileSync(`${path.join(bundleRoot, 'payload.mjs')}/..namedfork/rsrc`,
      'resource-fork-risk');
  }
  const archive = path.join(root, 'bundle.tar');
  const entries = createExactControlBundleArchive({ archive, directoryName,
    fileFacts: [{ name: 'payload.mjs' }], localParent });
  expect(entries.toSorted()).toEqual(
    ['bundle/', 'bundle/manifest.json', 'bundle/payload.mjs'].toSorted());
  expect(entries.every((name) => !name.includes('._'))).toBe(true);
  fs.rmSync(root, { force: true, recursive: true });
});

it('rejects top-level and payload AppleDouble archive members', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-appledouble-'));
  const bundleRoot = path.join(root, 'bundle'); fs.mkdirSync(bundleRoot);
  for (const name of ['manifest.json', 'payload.mjs', '._payload.mjs']) {
    fs.writeFileSync(path.join(bundleRoot, name), name);
  }
  fs.writeFileSync(path.join(root, '._bundle'), 'metadata');
  const archive = path.join(os.tmpdir(), `t152-invalid-${Date.now()}.tar`);
  execFileSync('tar', localTarArgs(['-cf', archive, '-C', root, '._bundle', 'bundle']), {
    env: { ...process.env, COPYFILE_DISABLE: '1' } });
  expect(() => validateControlBundleArchive({ archive, directoryName: 'bundle',
    fileFacts: [{ name: 'payload.mjs' }] })).toThrow();
  fs.rmSync(archive);
  fs.rmSync(root, { force: true, recursive: true });
});

it('rejects extra, missing, directory, and reparse tree entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-tree-'));
  const facts = [{ name: 'payload.mjs' }];
  fs.writeFileSync(path.join(root, 'manifest.json'), '{}');
  fs.writeFileSync(path.join(root, 'payload.mjs'), 'payload');
  expect(validateControlBundleTree({ fileFacts: facts, localRoot: root }))
    .toEqual(['manifest.json', 'payload.mjs']);
  fs.writeFileSync(path.join(root, 'extra'), 'extra');
  expect(() => validateControlBundleTree({ fileFacts: facts, localRoot: root })).toThrow();
  fs.rmSync(path.join(root, 'extra')); fs.rmSync(path.join(root, 'payload.mjs'));
  expect(() => validateControlBundleTree({ fileFacts: facts, localRoot: root })).toThrow();
  fs.symlinkSync(path.join(root, 'manifest.json'), path.join(root, 'payload.mjs'));
  expect(() => validateControlBundleTree({ fileFacts: facts, localRoot: root }))
    .toThrow('ordinary files');
  fs.rmSync(path.join(root, 'payload.mjs')); fs.mkdirSync(path.join(root, 'payload.mjs'));
  expect(() => validateControlBundleTree({ fileFacts: facts, localRoot: root }))
    .toThrow('ordinary files');
  fs.rmSync(root, { force: true, recursive: true });
});

it('rejects source basenames that collide under ordinal-ignore-case semantics', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't152-collision-'));
  const left = path.join(root, 'left'); const right = path.join(root, 'right');
  fs.mkdirSync(left); fs.mkdirSync(right);
  const files = [path.join(left, 'Owner.mjs'), path.join(right, 'owner.mjs')];
  files.forEach((file) => fs.writeFileSync(file, file));
  expect(() => createControlBundle({ bundleId: '11111111-1111-4111-8111-111111111111',
    capsuleRoot: path.join(root, 'capsule'), files, remoteBaseRoot: 'X:\\Root' }))
    .toThrow('collide under Windows semantics');
  fs.rmSync(root, { force: true, recursive: true });
});
