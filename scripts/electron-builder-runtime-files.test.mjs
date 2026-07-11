// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const builderConfigPath = resolve(__dirname, '../electron/builder.json');

async function readBuilderConfig() {
  const source = await readFile(builderConfigPath, 'utf8');
  return JSON.parse(source);
}

describe('electron-builder runtime file coverage', () => {
  it('packages shared config files imported by the Electron main process', async () => {
    const config = await readBuilderConfig();

    expect(config.files).toContain('dist/src/shared/config/**/*');
  });

  it('packages the Agent Control registry for both Electron and the public CLI', async () => {
    const config = await readBuilderConfig();

    expect(config.files).toContain('dist/scripts/agent-control/foliole-agent-routes.mjs');
    expect(config.files).toContain('dist/scripts/agent-control/foliole-agent-runtime-paths.mjs');
    expect(config.extraResources).toContainEqual({
      from: 'scripts/agent-control',
      to: 'scripts/agent-control'
    });
    expect(config.extraFiles).toContainEqual({ from: 'build/cli', to: 'bin' });
  });
});
