// @vitest-environment node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { it as test } from 'vitest';

import { validateOutputPath } from './simulator-paths.mjs';

test('reject output overlapping either input, including symlink aliases', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-simulator-paths-'));
  try {
    const input = path.join(root, 'input');
    mkdirSync(input);
    symlinkSync(input, path.join(root, 'alias'));
    const options = { database: path.join(input, 'foliole.db'), assets: input };
    for (const output of [input, root, path.join(input, 'output'), path.join(root, 'alias', 'output')]) {
      assert.throws(() => validateOutputPath(output, options), /output_overlaps_input/);
    }
    assert.throws(() => validateOutputPath(path.join(input, 'run'), { 'target-assets': input }), /output_overlaps_input/);
    assert.equal(validateOutputPath(path.join(root, 'output'), options), path.join(realpathSync(root), 'output'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
