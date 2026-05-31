import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const PREVIEW_SCRIPT = path.resolve(process.cwd(), 'scripts/windows/windows-preview.sh');

describe('windows preview native ABI preflight', () => {
  it('runs dependency/native preflight before choosing an update action', async () => {
    const script = await readFile(PREVIEW_SCRIPT, 'utf8');

    expect(script.indexOf('run_windows_native_preflight_if_needed')).toBeLessThan(script.indexOf('select_update_action'));
  });
});
