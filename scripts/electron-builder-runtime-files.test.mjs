// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const builderConfigPath = resolve(__dirname, '../electron/builder.json');
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('electron-builder/package.json'));
// Exercise the file matcher shipped by our declared electron-builder dependency.
const { FileMatcher } = builderRequire('app-builder-lib/out/fileMatcher.js');

async function readBuilderConfig() {
  const source = await readFile(builderConfigPath, 'utf8');
  return JSON.parse(source);
}

describe('electron-builder runtime file coverage', () => {
  it('loads and uses document preparation dependencies from the selected package contents', async () => {
    const root = resolve(__dirname, '..');
    const artifactRoot = resolve(root, '.tmp/artifacts');
    await mkdir(artifactRoot, { recursive: true });
    const packagedRoot = await mkdtemp(resolve(artifactRoot, 'document-package-'));
    try {
      const config = await readBuilderConfig();
      const selected = new FileMatcher(root, packagedRoot, value => value, config.files).createFilter();
      for (const name of ['documentPreparation', 'documentRetentionCache']) {
        const target = resolve(root, `dist/src/shared/lib/documents/${name}.js`);
        if (!selected(target, { isDirectory: () => false })) continue;
        const source = await readFile(resolve(root, `src/shared/lib/documents/${name}.ts`), 'utf8');
        const output = ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
        }).outputText;
        const destination = resolve(packagedRoot, `dist/src/shared/lib/documents/${name}.js`);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, output);
      }
      await writeFile(resolve(packagedRoot, 'package.json'), '{"type":"module"}');
      const probe = `
        import { DocumentPreparationQueue } from './dist/src/shared/lib/documents/documentPreparation.js';
        import { DocumentRetentionCache } from './dist/src/shared/lib/documents/documentRetentionCache.js';
        const cache = new DocumentRetentionCache(1, 1024, 1024, value => value.length);
        await new Promise(resolve => {
          const queue = new DocumentPreparationQueue(() => false, async key => {
            cache.set(key, 'prepared'); resolve();
          });
          queue.request(['next']);
        });
        if (cache.get('next') !== 'prepared') throw new Error('Document was not prepared');
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
        cwd: packagedRoot, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 10_000
      });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    } finally {
      await rm(packagedRoot, { recursive: true, force: true });
    }
  });

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
