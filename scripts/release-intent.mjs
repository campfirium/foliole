/* global process, console */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDefaultReleaseIntent } from './release-platform-contract.mjs';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

export async function prepareDefaultReleaseIntent(root, { write = false } = {}) {
  const read = file => readFile(path.join(root, file), 'utf8').then(JSON.parse);
  const [registry, product, manifest] = await Promise.all([
    read('.github/release-platforms.json'), read('package.json'), read('releases/update-manifest.json')
  ]);
  if (manifest.releases?.some(release => release.version === product.version)) {
    throw new Error('Choose the new product version before preparing its release intent; published history stays unchanged');
  }
  const publicationMode = manifest.desktopUpdater?.compatibilityBridgeVersion ? 'scoped' : 'bridge';
  const intent = createDefaultReleaseIntent({ registry, version: product.version, publicationMode });
  if (write) await writeFile(path.join(root, '.github/release-intent.json'), `${JSON.stringify(intent, null, 2)}\n`);
  return intent;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    assertQualityCommandAllowed('release:intent');
    if (process.argv.slice(2).some(arg => arg !== '--write')) throw new Error('Use release:intent with optional --write');
    console.log(JSON.stringify(await prepareDefaultReleaseIntent(process.cwd(), { write: process.argv.includes('--write') }), null, 2));
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
