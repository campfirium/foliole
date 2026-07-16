// @vitest-environment node

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AUTHENTICODE_POWERSHELL_EXECUTABLE,
  buildSignatureVerificationScript,
  collectSignatureTargets
} from './verify-artifact-signatures.mjs';

describe('Artifact Signing verification', () => {
  it('collects only requested PE files at the configured depth', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'foliole-signatures-'));
    mkdirSync(path.join(root, 'nested'));
    writeFileSync(path.join(root, 'Foliole.exe'), '');
    writeFileSync(path.join(root, 'notes.txt'), '');
    writeFileSync(path.join(root, 'nested', 'helper.dll'), '');

    expect(collectSignatureTargets(root, ['exe', 'dll'], false)).toEqual([
      path.join(root, 'Foliole.exe')
    ]);
    expect(collectSignatureTargets(root, ['exe', 'dll'], true)).toEqual([
      path.join(root, 'Foliole.exe'),
      path.join(root, 'nested', 'helper.dll')
    ]);
  });

  it('requires a valid Authenticode status for every target', () => {
    const script = buildSignatureVerificationScript(['C:\\Release\\Foliole.exe']);

    expect(script).toContain('Get-AuthenticodeSignature -LiteralPath $file');
    expect(script).toContain('SignatureStatus]::Valid');
    expect(script).toContain('exit 1');
  });

  it('uses PowerShell 7 so the Windows runner loads its matching security module', () => {
    expect(AUTHENTICODE_POWERSHELL_EXECUTABLE).toBe('pwsh.exe');
  });
});
