// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const names = [
  't152-windows-admission-run.mjs',
  't152-windows-capsule-control.mjs', 't152-windows-capsule-action.ps1',
  't152-windows-capsule-formal-runner.mjs', 't152-windows-formal-interactive-contract.mjs',
  't152-windows-formal-interactive-install.ps1',
  't152-windows-formal-interactive-worker.mjs', 't152-windows-prejourney-anchor.mjs',
  't152-windows-prepare-request.mjs', 't152-windows-prepare-request.test.mjs',
  't152-windows-control-bundle-verification.ps1',
  't152-windows-control-bundle-collections.ps1',
  't152-windows-script-parser.ps1',
  't152-windows-npm-runtime-owner.mjs',
  't152-windows-prepare-validation.mjs',
  't152-windows-prepare-stage-contract.mjs', 't152-windows-prepare-stage-runner.mjs',
  't152-windows-prepare-stages.mjs', 't152-windows-transfer-journal.mjs',
  'windows-dev-remote-spec.mjs',
  't152-macos-to-windows-find.mjs', 't152-windows-to-macos-find.mjs'
];
const sources = Object.fromEntries(names.map((name) => [name,
  fs.readFileSync(path.join('scripts', 'windows', name), 'utf8')]));
const all = Object.values(sources).join('\n');

it('pins immutable product/controller archives without consuming the Windows dev mirror', () => {
  const control = sources['t152-windows-capsule-control.mjs'];
  expect(control).toContain('86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a');
  expect(control).toContain('ec8af4a625d98fb35e86134d8770c50a5e669ccb');
  expect(control).toContain('controllerArchiveSha256');
  expect(all).not.toMatch(/refs\/heads\/dev|windows-dev-pull|D:\\C\\foliole/u);
});

it('has no fixed task parent, environment fallback, or second T152 path owner', () => {
  expect(all).not.toMatch(/[A-Za-z]:\\T152|\/private\/tmp\/foliole-t152/u);
  expect(all).not.toMatch(/os\.homedir\(\).*foliole-windows-android-lab/u);
  expect(sources['t152-windows-capsule-action.ps1']).not.toContain(
    'Join-Path $env:LOCALAPPDATA "Foliole');
  expect(sources['t152-windows-capsule-formal-runner.mjs']).toContain(
    'createT152DesktopDnsSdLibrary');
  expect(sources['t152-macos-to-windows-find.mjs']).toContain(
    'createT152DesktopDnsSdLibrary');
  expect(sources['t152-windows-to-macos-find.mjs']).toContain(
    'createT152DesktopDnsSdLibrary');
});

it('delegates every T152 SSH identity to the shared Windows transport owner', () => {
  const control = sources['t152-windows-capsule-control.mjs'];
  expect(control).toContain("from './windows-dev-remote-spec.mjs'");
  expect(control).toContain('windowsDevTransportIdentity({ env, host })');
  expect(control).not.toMatch(/FOLIOLE_WINDOWS_DEV_SSH|DEFAULT_HOST|function sshBase/u);
  expect(sources['windows-dev-remote-spec.mjs']).toContain('windowsDevTransportIdentity');
});

it('uses one runtime-compatible path predicate with normalization and dynamic negatives', () => {
  const action = sources['t152-windows-capsule-action.ps1'];
  const unavailableApi = ['IsPath', 'FullyQualified'].join('');
  expect(action).not.toContain(unavailableApi);
  expect(action.match(/function Resolve-OwnerFilesystemPath/g)).toHaveLength(1);
  expect(action).not.toMatch(/Get-Member|PSObject\.Methods|method.*fallback/iu);
  expect(action).toContain('[IO.Path]::GetFullPath($Value)');
  expect(action).toContain('Test-Path -LiteralPath $localRoot -PathType Container');
  expect(action).toContain('[StringComparison]::OrdinalIgnoreCase');
  for (const negative of ['relative', 'driveRelative', 'rootRelative', 'uri',
    'normalizationMismatch']) expect(action).toContain(negative);
  expect(action).toContain('powershellVersion');
  expect(action).toContain('clrVersion');
  expect(action).toContain('schemaSha256');
});

it('projects request properties as an explicit collection under strict mode', () => {
  const action = sources['t152-windows-capsule-action.ps1'];
  expect(action).toContain('$requestProperties = @($request.PSObject.Properties)');
  expect(action).toContain('fieldCount = [int]$requestProperties.Length');
  expect(action).not.toContain('$request.PSObject.Properties.Count');
  expect(action).not.toMatch(/fieldCount\s*=\s*\d+/u);
});

it('keeps source-free host facts read-only and verifies both archives before builds', () => {
  const action = sources['t152-windows-capsule-action.ps1'];
  const stage = sources['t152-windows-prepare-stage-runner.mjs'];
  expect(stage).toContain('prepare archive digest mismatch');
  expect(stage).toContain('prepare archive content mismatch');
  expect(`${action}\n${stage}`).not.toMatch(/Set-Net|New-Net|Remove-Net|Restart-Service|Set-Service/u);
  expect(action).toContain('T152_HOST_FACTS=');
});

it('uses one source-free npm distribution owner and one shell-free Node launcher', () => {
  const action = sources['t152-windows-capsule-action.ps1'];
  const owner = sources['t152-windows-npm-runtime-owner.mjs'];
  const contract = sources['t152-windows-prepare-stage-contract.mjs'];
  expect(action.match(/function Get-NpmRuntimeOwner/g)).toHaveLength(1);
  expect(action).toContain('t152-windows-npm-runtime-owner.mjs');
  expect(`${action}\n${owner}`).not.toMatch(/npm\s+exec|\bnpx\b|Get-ChildItem|where\.exe/iu);
  expect(owner).toContain("resolve.resolve('npm/package.json')");
  expect(owner).toContain('metadata.bin.npm');
  expect(contract).toContain('request.nodePath');
  expect(contract).toContain('[request.npmCliPath, ...args]');
  expect(contract).not.toContain('request.npmCommandPath,');
  expect(all).not.toMatch(/shell:\s*true|cmd\.exe|ComSpec/iu);
});

it('uses one prepare request owner and one token for preflight and prepare', () => {
  const stages = sources['t152-windows-prepare-stages.mjs'];
  const request = sources['t152-windows-prepare-request.mjs'];
  expect(stages.match(/createT152WindowsPrepareRequest/g)).toHaveLength(2);
  expect(stages).toContain("t152PrepareRemoteCommand(staging.action, 'binding-preflight'");
  expect(stages).toContain('`prepare-${stage}`');
  expect(request).toContain("'-RequestBase64', token");
  expect(request).not.toContain("'-Command'");
  expect(request).not.toMatch(/'-ArchivePath'|'-NpmPath'|'-TarPath'/u);
});

it('persists and rereads G1a before staging, then recovers every ordered terminal receipt', () => {
  const stages = sources['t152-windows-prepare-stages.mjs'];
  const transfer = sources['t152-windows-transfer-journal.mjs'];
  expect(stages.indexOf("'g1a-binding-terminal.json'")).toBeLessThan(
    stages.indexOf('capsule.productArchive'));
  expect(transfer).toContain('fs.renameSync(temporary, file)');
  expect(transfer).toContain('JSON.parse(fs.readFileSync(file');
  expect(stages).toContain('predecessorReceiptSha256');
  expect(transfer).toContain('process.kill(-child.pid');
  expect(stages).toContain('notStarted');
  expect(stages.match(/deadlineAt = Date\.now\(\) \+ PREPARE_DEADLINE_MS/g)).toHaveLength(2);
});

it('orders host facts before one control stream and serial payload terminals', () => {
  const control = sources['t152-windows-capsule-control.mjs'];
  const stages = sources['t152-windows-prepare-stages.mjs'];
  const transfer = sources['t152-windows-transfer-journal.mjs'];
  expect(control.indexOf('const hostFacts = facts ?? await readT152WindowsHostFacts'))
    .toBeLessThan(control.indexOf('const stages = await runT152WindowsPrepareStages'));
  expect(stages).toContain('createControlBundle');
  expect(stages).toContain("'g1a-control-bundle-terminal.json'");
  expect(stages).toContain("'g1b-payload-transfer-terminal.json'");
  expect(stages).not.toContain('Promise.all');
  expect(transfer).toContain('for (const item of items)');
  expect(transfer).toContain("return 'not_started'");
  expect(control).toContain("'g1-host-facts-terminal.json'");
  expect(transfer).toContain('captureSourceFreeHostFacts');
});

it('gates the exact archive before any control transfer and disables AppleDouble metadata', () => {
  const stages = sources['t152-windows-prepare-stages.mjs'];
  const transfer = sources['t152-windows-transfer-journal.mjs'];
  expect(transfer).toContain("COPYFILE_DISABLE: '1'");
  expect(transfer).toContain('validateControlBundleArchive');
  expect(transfer.indexOf('createExactControlBundleArchive')).toBeLessThan(
    transfer.indexOf('verificationToken'));
  expect(stages.indexOf('createControlBundle')).toBeLessThan(
    stages.indexOf('serialTransfers'));
  expect(transfer).not.toMatch(/filter\([^)]*\._|startsWith\(['"]\._/u);
});

it('parses every exact candidate script before verification and short-circuits on parser red', () => {
  const stages = sources['t152-windows-prepare-stages.mjs'];
  const transfer = sources['t152-windows-transfer-journal.mjs'];
  const parser = sources['t152-windows-script-parser.ps1'];
  expect(parser).toContain('[Management.Automation.Language.Parser]::ParseFile');
  expect(parser).toContain('errorsRuntimeType');
  expect(parser).toContain('astExtent');
  expect(parser).toContain('powershellVersion');
  expect(parser).toContain('clrVersion');
  expect(parser).not.toMatch(/Invoke-Expression|\beval\b/iu);
  expect(stages.indexOf('parseControlBundleScripts')).toBeLessThan(
    stages.indexOf('verifyAndCollectControlBundle'));
  expect(transfer).toContain("'-File', parserPath");
  expect(transfer).toContain('T152_SCRIPT_PARSE=');
  expect(stages).toContain("const verify = parser.state === 'success'");
});

it('retires the PowerShell stage helper and keeps one Node plan and receipt owner', () => {
  const action = sources['t152-windows-capsule-action.ps1'];
  const contract = sources['t152-windows-prepare-stage-contract.mjs'];
  const runner = sources['t152-windows-prepare-stage-runner.mjs'];
  expect(fs.existsSync('scripts/windows/t152-windows-prepare-stage.ps1')).toBe(false);
  expect(all).not.toContain('prepareHelperPath');
  expect(action).not.toContain('Invoke-T152PrepareStage');
  expect(action).toContain('$binding.request.stageRunnerPath');
  expect(contract.match(/PREPARE_STAGES =/gu)).toHaveLength(1);
  expect(runner).toContain('createPrepareStageReceipt');
  expect(runner).toContain("shell: false");
  expect(runner).not.toMatch(/spawn\([^)]*shell:\s*true/gu);
});

it('uses one scheduled worker for G2, G3, and formal execution', () => {
  const worker = sources['t152-windows-formal-interactive-worker.mjs'];
  const runner = sources['t152-windows-capsule-formal-runner.mjs'];
  expect(worker).toContain("request.phase === 'g2-path'");
  expect(worker).toContain("request.phase === 'g3-anchor'");
  expect(worker).toContain('runWindowsSyncGroupDeviceAction');
  expect(runner).toContain('t152-windows-formal-interactive-worker.mjs');
  expect(worker.indexOf("request.phase === 'g3-anchor'"))
    .toBeLessThan(worker.indexOf('loadDesktopDnsSdIdentityPreflight'));
  expect(worker.indexOf("request.phase === 'g3-anchor'"))
    .toBeLessThan(worker.indexOf("'create_sync_group'"));
});

it('keeps every controller entry syntactically valid', () => {
  for (const name of names.filter((name) => name.endsWith('.mjs'))) {
    expect(() => execFileSync('node', ['--check', path.join('scripts', 'windows', name)]))
      .not.toThrow();
  }
});
