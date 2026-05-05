// @vitest-environment node

import { expect, it } from 'vitest';

import { rebuildMirrorOutput } from './rebuildMirrorOutput.js';

it('rejects with a message that keeps incremental mirror output as the main path', async () => {
  await expect(rebuildMirrorOutput()).rejects.toThrow(
    'Mirror article rebuild is still being wired. Daily incremental mirror output remains the main path, and startup checks only backfill missing articles.'
  );
});
