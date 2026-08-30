// @vitest-environment node

import { expect, it } from 'vitest';
import { Buffer } from 'node:buffer';

import { canonicalPrepareJson, createT152WindowsPrepareRequest,
  decodeT152WindowsPrepareRequest, t152PrepareRemoteCommand } from
  './t152-windows-prepare-request.mjs';

const ROOT = '11111111-1111-4111-8111-111111111111';
const CAPSULE = '22222222-2222-4222-8222-222222222222';

function request() {
  return { capsuleId: CAPSULE, capsuleRoot: 'C:\\Owned Space\\胶囊',
    controllerArchivePath: 'C:\\Stage\\controller.tar', controllerRoot: 'C:\\Owned Space\\controller',
    evidenceRoot: 'C:\\Owned Space\\evidence', hostFactsSha256: 'a'.repeat(64),
    identity: { controllerCommit: 'b'.repeat(40), controllerTree: 'c'.repeat(40),
      productCommit: 'd'.repeat(40), productTree: 'e'.repeat(40), t7Run: '1' },
    manifestPath: 'C:\\Stage\\manifest.json', nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    npmPath: 'C:\\Program Files\\nodejs\\npm.cmd',
    productArchivePath: 'C:\\Stage\\产品.tar', rootId: ROOT,
    sourceRoot: 'C:\\Owned Space\\source', stageRunnerPath: 'C:\\Stage\\stage-runner.mjs',
    tarPath: 'C:\\Windows\\tar.exe' };
}

it('round trips canonical UTF-8 JSON through one unpadded base64url token', () => {
  const created = createT152WindowsPrepareRequest(request());
  expect(created.token).toMatch(/^[A-Za-z0-9_-]+$/u);
  expect(decodeT152WindowsPrepareRequest(created.token).request).toEqual(created.request);
  expect(created.requestJson).toBe(canonicalPrepareJson(created.request));
});

it('keeps paths with spaces and Unicode as single request fields', () => {
  const decoded = decodeT152WindowsPrepareRequest(createT152WindowsPrepareRequest(request()).token);
  expect(decoded.request.npmPath).toBe('C:\\Program Files\\nodejs\\npm.cmd');
  expect(decoded.request.productArchivePath).toBe('C:\\Stage\\产品.tar');
});

it('rejects missing fields, tampering, and hash mismatch', () => {
  const missing = request();
  delete missing.npmPath;
  expect(() => createT152WindowsPrepareRequest(missing)).toThrow();
  const token = createT152WindowsPrepareRequest(request()).token;
  expect(() => decodeT152WindowsPrepareRequest(`${token.slice(0, -1)}A`)).toThrow();
  const envelope = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  envelope.requestJson = envelope.requestJson.replace('npm.cmd', 'npx.cmd');
  const mismatched = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
  expect(() => decodeT152WindowsPrepareRequest(mismatched)).toThrow('hash mismatch');
});

it('uses only a committed file action and one request token remotely', () => {
  const token = createT152WindowsPrepareRequest(request()).token;
  const command = t152PrepareRemoteCommand('C:\\Stage\\action.ps1', 'prepare-materialize', token);
  expect(command).toEqual(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy',
    'Bypass', '-File', 'C:\\Stage\\action.ps1', '-Action', 'prepare-materialize',
    '-RequestBase64', token]);
  expect(command).not.toContain('-Command');
});
