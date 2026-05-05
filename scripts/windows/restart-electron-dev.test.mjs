import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/windows/restart-electron-dev.ps1');

describe('restart-electron-dev script', () => {
  it('matches the nested electron main entry command line used by Windows dev runtime', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain("electron-dist(?:[\\\\/]+electron)?[\\\\/]+main\\.js");
  });
});
