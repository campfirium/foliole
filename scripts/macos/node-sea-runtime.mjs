/* global Buffer, fetch */

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const NODE_SEA_RELEASE = {
  archive: 'node-v22.23.1-darwin-arm64.tar.gz',
  sha256: 'ef28d8fab2c0e4314522d4bb1b7173270aa3937e93b92cb7de79c112ac1fa953',
  version: '22.23.1'
};

export function resolveNodeSeaReleasePaths(root) {
  const cacheDirectory = path.join(root, '.tmp/macos/node-sea-runtime');
  const releaseDirectory = path.join(cacheDirectory, `node-v${NODE_SEA_RELEASE.version}-darwin-arm64`);
  return {
    archivePath: path.join(cacheDirectory, NODE_SEA_RELEASE.archive),
    cacheDirectory,
    nodePath: path.join(releaseDirectory, 'bin/node')
  };
}

function checksum(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function downloadArchive(archivePath, fetchImpl) {
  const url = `https://nodejs.org/download/release/v${NODE_SEA_RELEASE.version}/${NODE_SEA_RELEASE.archive}`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Node SEA runtime download failed with HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (checksum(data) !== NODE_SEA_RELEASE.sha256) throw new Error('Node SEA runtime checksum mismatch');
  await writeFile(archivePath, data);
}

export async function prepareNodeSeaRuntime(root, options = {}) {
  const paths = resolveNodeSeaReleasePaths(root);
  try {
    await access(paths.nodePath);
    return paths.nodePath;
  } catch {
    // The pinned official runtime has not been prepared in this workspace yet.
  }
  await mkdir(paths.cacheDirectory, { recursive: true });
  try {
    const archive = await readFile(paths.archivePath);
    if (checksum(archive) !== NODE_SEA_RELEASE.sha256) throw new Error('invalid cache');
  } catch {
    await downloadArchive(paths.archivePath, options.fetchImpl ?? fetch);
  }
  const run = options.run;
  if (!run) throw new Error('Node SEA runtime extraction runner is required');
  run('tar', ['-xzf', paths.archivePath, '-C', paths.cacheDirectory]);
  await access(paths.nodePath);
  return paths.nodePath;
}
