// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/windows/windows-preview-sandbox.sh');

describe('windows preview sandbox entry', () => {
  it('keeps sandbox data in the checkout tmp area and accepts a sample locale override', async () => {
    const script = await readFile(SCRIPT_PATH, 'utf8');

    expect(script).toContain('${WINDOWS_WORKDIR}\\\\.tmp\\\\preview-sandbox-library');
    expect(script).toContain('--sample-locale=*');
    expect(script).toContain('FOLIOLE_NATIVE_GUIDED_SAMPLE_LOCALE');
    expect(script).toContain('append_wslenv_var FOLIOLE_NATIVE_LIBRARY_HOME /w');
    expect(script).toContain('append_wslenv_var FOLIOLE_NATIVE_GUIDED_SAMPLE_LOCALE');
  });
});
