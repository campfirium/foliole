import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/windows/restart-electron-dev.ps1');

describe('restart-electron-dev script', () => {
  it('matches the nested electron main entry command line used by Windows dev runtime', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain("electron-dist(?:[\\\\/]+electron)?[\\\\/]+main\\.js");
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
    expect(script).toContain('$runtime = Get-ElectronRuntimeProcess -WorkDir $WindowsWorkDir');
  });
});
