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
  't152-windows-prepare-stage.ps1', 't152-windows-prepare-stages.mjs',
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
  const stage = sources['t152-windows-prepare-stage.ps1'];
  expect(stage.indexOf('prepare archive digest mismatch')).toBeLessThan(
    stage.indexOf("'dependencies'"));
  expect(stage.indexOf('prepare archive content mismatch')).toBeLessThan(
    stage.indexOf("'dependencies'"));
  expect(`${action}\n${stage}`).not.toMatch(/Set-Net|New-Net|Remove-Net|Restart-Service|Set-Service/u);
  expect(action).toContain('T152_HOST_FACTS=');
});

it('uses one prepare request owner and one token for preflight and prepare', () => {
  const control = sources['t152-windows-capsule-control.mjs'];
  const request = sources['t152-windows-prepare-request.mjs'];
  expect(control.match(/createT152WindowsPrepareRequest/g)).toHaveLength(2);
  expect(sources['t152-windows-prepare-stages.mjs']).toContain(
    "t152PrepareRemoteCommand(staging.action, 'binding-preflight'");
  expect(sources['t152-windows-prepare-stages.mjs']).toContain('`prepare-${stage}`');
  expect(request).toContain("'-RequestBase64', token");
  expect(request).not.toContain("'-Command'");
  expect(request).not.toMatch(/'-ArchivePath'|'-NpmPath'|'-TarPath'/u);
});

it('persists and rereads G1a before staging, then recovers every ordered terminal receipt', () => {
  const stages = sources['t152-windows-prepare-stages.mjs'];
  expect(stages.indexOf("'g1a-binding-terminal.json'")).toBeLessThan(
    stages.indexOf('staging.helperLocal'));
  expect(stages).toContain('fs.renameSync(temporary, file)');
  expect(stages).toContain('JSON.parse(fs.readFileSync(file');
  expect(stages).toContain('predecessorReceiptSha256');
  expect(stages).toContain('process.kill(-child.pid');
  expect(stages).toContain('notStarted');
  expect(stages.match(/deadlineAt = Date\.now\(\) \+ PREPARE_DEADLINE_MS/g)).toHaveLength(2);
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
