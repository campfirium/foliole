import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/windows/restart-electron-dev.ps1');

describe('restart-electron-dev script', () => {
  it('matches the nested electron main entry command line used by Windows dev runtime', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('Get-Process -Name "electron" -ErrorAction SilentlyContinue');
    expect(script).toContain('Test-ProcessMatchesExpectedRuntime -Process $candidate -ExpectedRuntimePath $expectedRuntimePath');
  });

  it('reports structured trust status for running and stopped client states', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('status: RUNNING trust=OK');
    expect(script).toContain('status: STOPPED trust=FAILED reason=');
    expect(script).toContain('status: STOPPED trust=FAILED reason=no-runtime');
  });

  it('reports discarded untrusted runtimes with trust details', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('discarded untrusted runtime trust=FAILED pid=');
    expect(script).toContain('marker_session=');
    expect(script).toContain('bridge_marker_session=');
  });

  it('does not classify a sole runtime candidate as stale when tracking metadata is missing', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('if ($candidates.Count -eq 1) {');
    expect(script).toContain('return @()');
    expect(script).toContain('function Get-ElectronRuntimeProcess');
    expect(script).toContain('function Get-ManagedRuntimeProcess');
  });

  it('skips global runtime scans when no tracked windows client state exists', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('function Test-ShouldScanRuntimeCandidates');
    expect(script).toContain('function Get-ManagedRuntimeProcess');
    expect(script).toContain('if (-not (Test-ShouldScanRuntimeCandidates -WorkDir $WorkDir -ExpectedSession $ExpectedSession)) {');
    expect(script).toContain('$runtime = Get-ManagedRuntimeProcess -WorkDir $WindowsWorkDir -ExpectedSession $runtimeSession');
    expect(script).toContain('if (Test-HasTrackedClientState) {');
    expect(script).toContain('Stop-StaleFolioleDevProcesses -WorkDir $WorkDir');
    expect(script).toContain('Get-ReadyMarkerRuntimeProcess -WorkDir $WorkDir -ExpectedSession $ExpectedSession');
  });

  it('accepts a single matching runtime candidate during startup before ready markers land', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('function Wait-ElectronHealthy');
    expect(script).toContain('$runtimeCandidates = @(Get-ElectronRuntimeCandidates -WorkDir $WorkDir)');
    expect(script).toContain('if ($runtimeCandidates.Count -eq 1) {');
    expect(script).toContain('$runtime = $runtimeCandidates[0]');
  });

  it('bounds taskkill waits so full restarts cannot hang indefinitely on process teardown', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('function Get-TaskkillTimeoutSeconds');
    expect(script).toContain('Start-Process -FilePath "taskkill.exe"');
    expect(script).toContain('Wait-Process -Id $taskkill.Id -Timeout (Get-TaskkillTimeoutSeconds)');
    expect(script).toContain('taskkill timeout pid=');
    expect(script).toContain('process still running after forced stop pid=');
  });

  it('keeps stale-process cleanup scoped to the Electron dev loop', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).not.toContain('foliole-tauri-core');
    expect(script).not.toContain("^cargo(?:\\.exe)?$");
    expect(script).not.toContain('.*tauri');
  });
});
