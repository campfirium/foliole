import fs from 'node:fs';

import { expect, it } from 'vitest';

const read = (name) => fs.readFileSync(`scripts/windows/${name}`, 'utf8');
const action = read('t152-windows-capsule-action.ps1');
const collections = read('t152-windows-control-bundle-collections.ps1');
const verifier = read('t152-windows-control-bundle-verification.ps1');
const stages = read('t152-windows-prepare-stages.mjs');
const transfer = read('t152-windows-transfer-journal.mjs');
const runner = read('t152-windows-prepare-stage-runner.mjs');

it('keeps one token verifier and collector ahead of runtime ownership', () => {
  const verifyCall = transfer.slice(transfer.indexOf("'-Action', 'verify-control-bundle'"),
    transfer.indexOf('await collectControlBundleReceipt'));
  expect(verifyCall).toContain("'-VerificationBase64', bundle.verificationToken");
  expect(verifyCall).not.toMatch(/NodePath|StageRunnerPath|nodePath|runner/iu);
  expect(action).toContain("Join-Path $PSScriptRoot 't152-windows-control-bundle-verification.ps1'");
  expect(action).not.toContain('[string]$StageRunnerPath');
  expect(runner).not.toContain('verify-control-bundle');
  expect(verifier).not.toMatch(/node|npm|Get-NpmRuntimeOwner|StageRunner/iu);
  expect(stages.indexOf('verifyAndCollectControlBundle')).toBeLessThan(
    stages.indexOf("'binding-preflight'"));
});

it('preserves flat collection containers for empty, one, and many values', () => {
  expect(collections).toContain('[Collections.ArrayList]$Target');
  expect(collections).not.toContain('Write-Output -NoEnumerate');
  expect(collections).not.toMatch(/\$target\s*=\s*if|=\s*Get-(?:Flat|Stable|Name|Compare|Entry)/iu);
  for (const fact of ["input = [object[]]@(); count = 0", "input = 'Alpha'; count = 1",
    "input = [object[]]@('Alpha'); count = 1", 'input = $list; count = 2',
    "input = [object[]]@('Alpha', 'beta'); count = 2"]) expect(collections).toContain(fact);
  expect(collections).toContain("$item.sideIndicator -eq '<='");
  expect(collections).toContain("$item.sideIndicator -eq '=>'");
  expect(collections).not.toMatch(/Group-Object|Where-Object\s*\{\s*\$_.Count/iu);
});

it('initializes a trusted durable receipt before collection selfcheck', () => {
  expect(verifier).toContain('verificationSha256');
  expect(verifier).toContain('bundle path escaped its dynamic base root');
  expect(verifier).toContain('bundle file set mismatch');
  expect(verifier).toContain('verification field missing');
  expect(verifier.indexOf('$receipt = [ordered]@')).toBeLessThan(
    verifier.indexOf('Confirm-CollectionProjectionSelfcheck'));
  expect(verifier).toContain("state = 'failure'");
  for (const fact of ['type = $Record.Exception.GetType().FullName', 'message = [string]',
    'positionMessage', 'scriptLineNumber', 'offsetInLine']) expect(verifier).toContain(fact);
  expect(verifier.indexOf('Write-FileSetReceipt $receiptPath $receipt')).toBeLessThan(
    verifier.indexOf("if ($failures.Count) { throw"));
});

it('binds the receipt path to one validated path-owner call', () => {
  expect(verifier).toContain('$receiptPathInput = [string]$value.verificationReceiptPath');
  expect(verifier).toContain(
    "$receiptPathOwner = Resolve-OwnerFilesystemPath $receiptPathInput 'verification receipt'");
  expect(verifier).toContain('$receiptPath = $receiptPathOwner.normalized');
  expect(verifier.match(/Resolve-OwnerFilesystemPath \$receiptPathInput/g)).toHaveLength(1);
});
