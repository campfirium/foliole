import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/windows/run-node-in-windows-repo.ps1');

describe('run-node-in-windows-repo script', () => {
  it('refuses known native sqlite scripts before invoking plain Windows Node', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('function Test-IsBlockedNativeNodeScript');
    expect(script).toContain('scripts/backfill-node-opening-text.ts');
    expect(script).toContain('scripts/backfill-source-disposition-states.ts');
    expect(script).toContain('scripts/node-kind-report.ts');
    expect(script).toContain('scripts/sqlite-maintenance.ts');
    expect(script).toContain('scripts/android/android-device-data-protection.mjs');
    expect(script).toContain('scripts/android/android-sync-audit.mjs');
    expect(script).toContain('refusing to run native sqlite script with plain Windows Node');
    expect(script.indexOf('Test-IsBlockedNativeNodeScript -CandidatePath $ScriptPath')).toBeLessThan(
      script.indexOf('Push-Location $WindowsWorkDir')
    );
  });
});
