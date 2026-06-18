import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/windows/run-node-in-windows-repo.ps1');

describe('run-node-in-windows-repo script', () => {
  it('refuses known native sqlite scripts before invoking plain Windows Node', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('function Test-IsBlockedNativeNodeScript');
    expect(script).toContain('function Resolve-NodeExecutable');
    expect(script).toContain('FOLIOLE_WINDOWS_NODE_EXE');
    expect(script).toContain('node.exe not found; set FOLIOLE_WINDOWS_NODE_EXE');
    expect(script).toContain('[string]$RuntimeHead = ""');
    expect(script).toContain('$previousRuntimeHead = $env:FOLIOLE_RUNTIME_HEAD');
    expect(script).toContain('$env:FOLIOLE_RUNTIME_HEAD = $RuntimeHead');
    expect(script).toContain('function Invoke-NodeScript');
    expect(script).toContain('-RedirectStandardOutput $stdoutLog');
    expect(script).toContain('-RedirectStandardError $stderrLog');
    expect(script).toContain('$script:NodeScriptExitCode = $process.ExitCode');
    expect(script).toContain('scripts/oneoff/backfill-node-opening-text.ts');
    expect(script).toContain('scripts/oneoff/backfill-source-disposition-states.ts');
    expect(script).toContain('scripts/oneoff/node-kind-report.ts');
    expect(script).toContain('scripts/sqlite/sqlite-maintenance.ts');
    expect(script).toContain('scripts/android/android-device-data-protection.mjs');
    expect(script).toContain('scripts/android/android-sync-audit.mjs');
    expect(script).toContain('refusing to run native sqlite script with plain Windows Node');
    expect(script.indexOf('Test-IsBlockedNativeNodeScript -CandidatePath $ScriptPath')).toBeLessThan(
      script.indexOf('Push-Location $WindowsWorkDir')
    );
    expect(script).toContain('$nodePath = Resolve-NodeExecutable');
    expect(script).toContain('Invoke-NodeScript -NodePath $nodePath -ResolvedScriptPath $resolvedScriptPath -Arguments $NodeArgs');
    expect(script).toContain('exit $script:NodeScriptExitCode');
    expect(script).toContain('Remove-Item Env:FOLIOLE_RUNTIME_HEAD');
  });
});
