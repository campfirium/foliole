// @vitest-environment node

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { expect, it } from 'vitest';

import { createInteractiveConfig, createInteractiveEnvelope, decodeInteractiveEnvelope,
  interactiveRemoteCommand, validateInteractiveProjectionReceipt } from
  './t152-windows-interactive-envelope.mjs';

const ROOT = '11111111-1111-4111-8111-111111111111';
const CAPSULE = '22222222-2222-4222-8222-222222222222';
const SHA = (value) => createHash('sha256').update(value).digest('hex');

function prepared() {
  const capsuleRoot = `Q:\\Capsule Root\\资料\\${CAPSULE}`;
  return { capsule: { manifest: { identity: { controllerCommit: 'a'.repeat(40),
    controllerTree: 'b'.repeat(40), productCommit: 'c'.repeat(40),
    productTree: 'd'.repeat(40), t7Run: '33270551363' } } },
  facts: { roots: { programFiles: 'C:\\Program Files', systemRoot: 'C:\\Windows' },
    runtime: { nodePath: 'C:\\Program Files\\nodejs\\node.exe' } },
  paths: { capsuleRoot, controllerRoot: `${capsuleRoot}\\controller`,
    evidenceRoot: `${capsuleRoot}\\evidence\\prepare`, sourceRoot: `${capsuleRoot}\\source`,
    taskBaseRoot: 'R:\\Task Roots\\任务' },
  preparedRequest: { requestSha256: SHA('request'), token: 'valid_token' },
  stages: { preflight: { receipt: { stagePlan: { planSha256: SHA('plan') } } } } };
}

it.each(['g2-path', 'g3-anchor'])('round trips one canonical %s config with G1 binding', (phase) => {
  const config = createInteractiveConfig(prepared(), phase, ROOT);
  const envelope = createInteractiveEnvelope(config);
  expect(decodeInteractiveEnvelope(envelope.token)).toEqual({ config,
    configSha256: envelope.configSha256 });
  expect(config.g1).toMatchObject({ planSha256: SHA('plan'), requestSha256: SHA('request'),
    tokenSha256: SHA('valid_token') });
  expect(config.configPath).toContain(`control\\interactive\\${ROOT}\\${phase}.json`);
  expect(config.nodePath).toBe('C:\\Program Files\\nodejs\\node.exe');
  expect(config.formalAttempt).toEqual({ allocated: false, started: false });
});

it('keeps the formal binding projection side-effect free and unallocated', () => {
  const config = createInteractiveConfig(prepared(), 'formal', ROOT,
    { action: 'desktop-dnssd-advertise-acceptance' }, { projectionOnly: true });
  expect(config).toMatchObject({ action: 'desktop-dnssd-advertise-acceptance',
    entryMode: 'projection', formalAttempt: { allocated: false, started: false }, phase: 'formal' });
  expect(config).not.toHaveProperty('attemptId');
  expect(config.projectionReceiptPath).toContain('formal-projection-receipt.json');
});

function projectionFixture() {
  const config = createInteractiveConfig(prepared(), 'g2-path', ROOT, {},
    { projectionOnly: true });
  const envelope = createInteractiveEnvelope(config);
  const pathFacts = Object.fromEntries(['baseRoot', 'capsuleRoot', 'configPath',
    'controllerRoot', 'evidenceRoot', 'nodePath', 'ownerReceiptPath', 'sourceRoot',
    'stateRoot', 'projectionReceiptPath'].map((name) => [name,
    { normalized: config[name], value: config[name], localRoot: 'Q:\\' }]));
  const receipt = { action: config.action, configRawBase64: Buffer.from(envelope.configJson)
    .toString('base64'), configSha256: envelope.configSha256, entryMode: 'projection',
  formalAttempt: config.formalAttempt, g1: config.g1, identity: { capsuleId: config.capsuleId,
    controllerCommit: config.controllerCommit, controllerTree: config.controllerTree,
    productCommit: config.productCommit, productTree: config.productTree, rootId: config.rootId,
    t7Run: config.t7Run }, materializedSha256: envelope.configSha256, paths: pathFacts,
  phase: config.phase, productStarted: false, projectionReceiptPath: config.projectionReceiptPath,
  scheduledWorkerStarted: false, schemaVersion: 1, tokenSha256: envelope.tokenSha256 };
  return { envelope, receipt };
}

it('strictly validates durable Unicode projection bytes and raw config', () => {
  const { envelope, receipt } = projectionFixture();
  const bytes = Buffer.from(JSON.stringify(receipt), 'utf8');
  expect(validateInteractiveProjectionReceipt(bytes, envelope)).toEqual(receipt);
  expect(receipt.paths.capsuleRoot.normalized).toContain('资料');
});

it('rejects invalid UTF-8, replacement text, and identity or raw-config drift', () => {
  const { envelope, receipt } = projectionFixture();
  expect(() => validateInteractiveProjectionReceipt(Buffer.from([0xc3, 0x28]), envelope))
    .toThrow('strict UTF-8');
  expect(() => validateInteractiveProjectionReceipt(Buffer.from('{"x":"�"}'), envelope))
    .toThrow('replacement text');
  expect(() => validateInteractiveProjectionReceipt(Buffer.from(JSON.stringify(
    { ...receipt, tokenSha256: SHA('wrong') })), envelope)).toThrow('identity mismatch');
  expect(() => validateInteractiveProjectionReceipt(Buffer.from(JSON.stringify(
    { ...receipt, configRawBase64: Buffer.from('wrong').toString('base64') })), envelope))
    .toThrow('identity mismatch');
});

it('rejects token or config tampering', () => {
  const envelope = createInteractiveEnvelope(createInteractiveConfig(prepared(), 'g2-path', ROOT));
  const decoded = JSON.parse(Buffer.from(envelope.token, 'base64url').toString('utf8'));
  decoded.configJson = decoded.configJson.replace('g2-path', 'g3-anchor');
  const tampered = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
  expect(() => decodeInteractiveEnvelope(tampered)).toThrow('hash mismatch');
  expect(() => decodeInteractiveEnvelope(`${envelope.token}!`)).toThrow('token is invalid');
});

it('forms only script, fixed action, and one scalar token for OpenSSH', () => {
  const token = createInteractiveEnvelope(createInteractiveConfig(
    prepared(), 'g2-path', ROOT)).token;
  const command = interactiveRemoteCommand('C:\\Task Tools\\t152-action.ps1', 'g2-path', token);
  expect(command).toEqual(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy',
    'Bypass', '-File', 'C:\\Task Tools\\t152-action.ps1', '-Action', 'g2-path',
    '-InteractiveBase64', token]);
  expect(command.join(' ')).not.toMatch(/-NodePath|-ConfigPath|-CapsuleRoot|-Group|-Attempt/u);
});
