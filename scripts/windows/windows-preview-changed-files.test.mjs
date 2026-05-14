// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHANGE_SELECTION_SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-preview-change-selection.sh');

describe('windows-preview changed file collection', () => {
  it('excludes deleted files from unstaged and staged git diffs', async () => {
    const script = await readFile(CHANGE_SELECTION_SCRIPT, 'utf8');

    expect(script).toContain('git diff --name-only --diff-filter=ACMR');
    expect(script).toContain('git diff --name-only --diff-filter=ACMR --cached');
  });
});
