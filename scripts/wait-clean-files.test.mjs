// @vitest-environment node
/* global process */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WAIT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'wait-clean-files.mjs');

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

async function writePackageJson(cwd, packageJson) {
  await writeFile(path.join(cwd, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

async function writePackageLock(cwd, packageLock) {
  await writeFile(path.join(cwd, 'package-lock.json'), `${JSON.stringify(packageLock, null, 2)}\n`, 'utf8');
}

async function createRepo() {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'wait-clean-files-'));
  git(repo, ['init']);
  await writePackageJson(repo, {
    name: 'wait-clean-files-fixture',
    private: true,
    scripts: { test: 'node test.mjs' },
    dependencies: { example: '1.0.0' }
  });
  await writePackageLock(repo, {
    name: 'wait-clean-files-fixture',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'wait-clean-files-fixture',
        dependencies: { example: '1.0.0' }
      },
      'node_modules/example': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
        integrity: 'sha512-old'
      }
    }
  });
  git(repo, ['add', 'package.json', 'package-lock.json']);
  git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init']);
  return repo;
}

function runWaitClean(cwd, args) {
  return spawnSync(process.execPath, [WAIT_SCRIPT, '--timeout-ms', '0', ...args], {
    cwd,
    encoding: 'utf8'
  });
}

describe('wait-clean-files package.json scripts edit isolation', () => {
  it('allows package.json dependency dirty state when scripts are unchanged', async () => {
    const repo = await createRepo();
    try {
      await writePackageJson(repo, {
        name: 'wait-clean-files-fixture',
        private: true,
        scripts: { test: 'node test.mjs' },
        dependencies: { example: '1.0.1' }
      });

      const result = runWaitClean(repo, ['--allow-package-json-scripts-edit', 'package.json']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[wait-clean-files] clean');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('still blocks when package.json scripts are dirty', async () => {
    const repo = await createRepo();
    try {
      await writePackageJson(repo, {
        name: 'wait-clean-files-fixture',
        private: true,
        scripts: { test: 'node changed-test.mjs' },
        dependencies: { example: '1.0.0' }
      });

      const result = runWaitClean(repo, ['--allow-package-json-scripts-edit', 'package.json']);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('package.json');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('keeps package.json dirty state blocking without the scripts edit option', async () => {
    const repo = await createRepo();
    try {
      await writePackageJson(repo, {
        name: 'wait-clean-files-fixture',
        private: true,
        scripts: { test: 'node test.mjs' },
        dependencies: { example: '1.0.1' }
      });

      const result = runWaitClean(repo, ['package.json']);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('package.json');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe('wait-clean-files package dependency edit isolation', () => {
  it('allows dependency-only package.json and package-lock.json dirty state', async () => {
    const repo = await createRepo();
    try {
      await writePackageJson(repo, {
        name: 'wait-clean-files-fixture',
        private: true,
        scripts: { test: 'node test.mjs' },
        dependencies: { example: '1.0.1' }
      });
      await writePackageLock(repo, {
        name: 'wait-clean-files-fixture',
        lockfileVersion: 3,
        packages: {
          '': {
            name: 'wait-clean-files-fixture',
            dependencies: { example: '1.0.1' }
          },
          'node_modules/example': {
            version: '1.0.1',
            resolved: 'https://registry.npmjs.org/example/-/example-1.0.1.tgz',
            integrity: 'sha512-new'
          }
        }
      });

      const result = runWaitClean(repo, [
        '--allow-package-dependency-edit',
        'package.json',
        'package-lock.json'
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[wait-clean-files] clean');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('blocks package.json non-dependency dirty state', async () => {
    const repo = await createRepo();
    try {
      await writePackageJson(repo, {
        name: 'changed-name',
        private: true,
        scripts: { test: 'node test.mjs' },
        dependencies: { example: '1.0.1' }
      });

      const result = runWaitClean(repo, ['--allow-package-dependency-edit', 'package.json']);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('package.json');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('blocks package-lock.json root metadata dirty state', async () => {
    const repo = await createRepo();
    try {
      await writePackageLock(repo, {
        name: 'changed-lock-name',
        lockfileVersion: 3,
        packages: {
          '': {
            name: 'wait-clean-files-fixture',
            dependencies: { example: '1.0.1' }
          },
          'node_modules/example': {
            version: '1.0.1',
            resolved: 'https://registry.npmjs.org/example/-/example-1.0.1.tgz',
            integrity: 'sha512-new'
          }
        }
      });

      const result = runWaitClean(repo, ['--allow-package-dependency-edit', 'package-lock.json']);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('package-lock.json');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
