import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const PREVIEW_SCRIPT = path.resolve(process.cwd(), 'scripts/windows/windows-preview.sh');

describe('windows preview native ABI preflight', () => {
  it('runs native ABI preflight before choosing an update action', async () => {
    const script = await readFile(PREVIEW_SCRIPT, 'utf8');

    expect(script.indexOf('verify_windows_node_modules')).toBeLessThan(
      script.indexOf('verify_windows_native_abi')
    );
    expect(script.indexOf('verify_windows_native_abi')).toBeLessThan(script.indexOf('select_update_action'));
  });
});
