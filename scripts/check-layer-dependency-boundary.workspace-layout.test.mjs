// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { inspectLayerDependencyBoundary } from './check-layer-dependency-boundary.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_ROOT_BASE = path.join(REPO_ROOT, '.tmp-tests');
const tempDirs = [];

async function createFixtureRoot() {
  await mkdir(TEMP_ROOT_BASE, { recursive: true });
  const fixtureRoot = await mkdtemp(path.join(TEMP_ROOT_BASE, 'workspace-layout-boundary-'));
  tempDirs.push(fixtureRoot);
  await mkdir(path.join(fixtureRoot, 'src', 'app', 'hooks'), { recursive: true });
  await mkdir(path.join(fixtureRoot, 'src', 'features'), { recursive: true });
  return fixtureRoot;
}

async function writeFixtureFile(repoRoot, relativePath, contents) {
  await writeFile(path.join(repoRoot, relativePath), contents.trimStart(), 'utf8');
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-layer-dependency-boundary workspace layout domain imports', () => {
  it('blocks migrated workspace layout consumers from reading the store shape directly', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/app/hooks/useWorkspaceLayout.ts', `
      import { LIST_WIDTH_DEFAULT, useWorkspaceStore } from '../../store/workspaceStore';

      export function useWorkspaceLayout() {
        return useWorkspaceStore((state) => ({
          defaultWidth: LIST_WIDTH_DEFAULT,
          listWidth: state.layout.listWidth
        }));
      }
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        { file: 'src/app/hooks/useWorkspaceLayout.ts', line: 1, kind: 'workspace-layout-store-import' },
        { file: 'src/app/hooks/useWorkspaceLayout.ts', line: 1, kind: 'workspace-layout-store-shape' }
      ])
    );
  });

  it('allows migrated workspace layout consumers to use the layout domain entry', async () => {
    const repoRoot = await createFixtureRoot();
    await writeFixtureFile(repoRoot, 'src/app/hooks/useWorkspaceLayout.ts', `
      import { LIST_WIDTH_DEFAULT, useWorkspaceLayoutState } from '../../store/workspaceLayoutDomain';

      export function useWorkspaceLayout() {
        const layout = useWorkspaceLayoutState();
        return { defaultWidth: LIST_WIDTH_DEFAULT, listWidth: layout.listWidth };
      }
    `);

    const result = inspectLayerDependencyBoundary({ repoRoot });

    expect(result.ok).toBe(true);
  });
});
