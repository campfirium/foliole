/* global console */
import process from 'node:process';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolveReleasePlatformIdentity } from './release-platform-contract.mjs';
import { currentPlatformRelease } from './release-download-directory.mjs';
import { createReleaseDownloadTable } from './release-download-table.mjs';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

export async function readReleaseDownloadPreview({ cwd, identity, manifest, run = execFileSync, candidate, review }) {
  const release = version => JSON.parse(run('gh', ['api', `repos/campfirium/foliole/releases/tags/v${version}`], { cwd, encoding: 'utf8' }));
  const selected = new Set(identity.intent.selectedPlatforms);
  const versions = [...new Set(identity.registry.platforms.filter(platform => platform.status === 'active' &&
    platform.deliveryChannel === 'github-release' && !selected.has(platform.id))
    .map(platform => currentPlatformRelease(manifest, platform.id)?.version).filter(Boolean))];
  const publishedReleases = Object.fromEntries(versions.map(version => [version, release(version)]));
  return createReleaseDownloadTable({ identity, manifest, publishedReleases, review, candidate: candidate ?? release(identity.intent.version) });
}

export async function previewReleaseDownloads({ cwd = process.cwd(), run = execFileSync, output } = {}) {
  const read = file => readFile(path.join(cwd, file), 'utf8').then(JSON.parse);
  const [product, registry, intent, manifest] = await Promise.all([
    read('package.json'), read('.github/release-platforms.json'), read('.github/release-intent.json'), read('releases/update-manifest.json')
  ]);
  const sha = run('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const identity = resolveReleasePlatformIdentity({ registry, intent, packageVersion: product.version, sha });
  const result = await readReleaseDownloadPreview({ cwd, run, identity, manifest });
  if (output) {
    const file = path.resolve(cwd, output); const root = path.resolve(cwd, '.tmp/artifacts');
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Download previews must be saved under .tmp/artifacts');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${result.table}\n`);
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    assertQualityCommandAllowed('release:downloads');
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1])) throw new Error('Use release:downloads [--output .tmp/artifacts/<file>]');
    console.log((await previewReleaseDownloads({ output: args[1] })).table);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
