// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('windows native preview entry', () => {
  it('keeps the native preview behind the shared preview scheduler', async () => {
    const packageJson = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(packageJson.scripts['windows:preview:native']).toBe(
      'PREVIEW_DEDUPE_REQUIRE_ACTUAL=1 node scripts/preview-dedupe.mjs windows -- node scripts/windows/windows-preview-native.mjs'
    );
    expect(packageJson.scripts['windows:preview:sandbox']).toBe(
      'PREVIEW_DEDUPE_FORCE=1 PREVIEW_DEDUPE_WAIT_ON_FAILURE=0 PREVIEW_DEDUPE_RUNTIME_DIR=.lab/internal/runtime/windows-sandbox node scripts/preview-dedupe.mjs windows -- bash scripts/windows/windows-preview-sandbox.sh'
    );
  });
});
