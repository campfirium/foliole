// @vitest-environment node

import { once } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createServer } from 'vite';
import { expect, it } from 'vitest';

import { createSharedViteConfig } from '../vite.shared.ts';

const artifactRoot = path.resolve('.tmp/artifacts/vite-watch');
const generatedNames = ['.tmp', '.lab', '.cache'];

async function createFixture(backlinksAtStartup) {
  await mkdir(artifactRoot, { recursive: true });
  const root = await mkdtemp(path.join(artifactRoot, 'case-'));
  for (const name of ['src', ...generatedNames]) {
    await mkdir(path.join(root, name));
    await writeFile(path.join(root, name, 'entry.ts'), 'export const value = "before";');
  }
  const resolvedRoot = await realpath(root);
  if (backlinksAtStartup) await addBacklinks(resolvedRoot);
  return resolvedRoot;
}

async function addBacklinks(root) {
  for (const name of generatedNames) {
    await symlink(root, path.join(root, name, 'backlink'), 'junction');
  }
}

function generatedWatchedPaths(server, root) {
  return Object.keys(server.watcher.getWatched()).filter((directory) => {
    const first = path.relative(root, directory).split(path.sep)[0];
    return generatedNames.includes(first);
  });
}

it.each([true, false])('ignores generated backlinks (present at startup: %s) while refreshing source', async (backlinksAtStartup) => {
  const root = await createFixture(backlinksAtStartup);
  const shared = createSharedViteConfig(root);
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    appType: 'custom',
    server: { ...shared.server, middlewareMode: true }
  });
  try {
    await once(server.watcher, 'ready');
    expect(generatedWatchedPaths(server, root)).toEqual([]);
    if (!backlinksAtStartup) await addBacklinks(root);
    expect((await server.transformRequest('/src/entry.ts')).code).toContain('before');
    await writeFile(path.join(root, 'src/entry.ts'), 'export const value = "after";');
    await expect.poll(async () => (await server.transformRequest('/src/entry.ts')).code)
      .toContain('after');
    expect(generatedWatchedPaths(server, root)).toEqual([]);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
