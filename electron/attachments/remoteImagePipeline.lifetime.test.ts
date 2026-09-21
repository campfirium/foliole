// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { it } from 'vitest';

it('completed image bytes are collectible after consumers release them', () => {
  execFileSync(process.execPath, [
    '--expose-gc',
    fileURLToPath(new URL('./remoteImagePipeline.lifetime-probe.mjs', import.meta.url))
  ], { timeout: 30_000, stdio: 'pipe' });
});
