// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MTIME_CHANGES_SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-preview-mtime-changes.sh');

describe('windows-preview changed file collection', () => {
  it('uses the sync stamp mtime instead of git diff for preview change collection', async () => {
    const script = await readFile(MTIME_CHANGES_SCRIPT, 'utf8');

    expect(script).toContain('WINDOWS_PREVIEW_SYNC_STAMP_FILE');
    expect(script).toContain('-newer "${stamp_file}"');
    expect(script).not.toContain('git diff --name-only --diff-filter=ACMR');
  });
});
