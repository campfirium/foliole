/* global process, console */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createReleaseIntent } from './release-platform-contract.mjs';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

export async function prepareDefaultReleaseIntent(root, { write = false, platforms, compatibility } = {}) {
  const read = file => readFile(path.join(root, file), 'utf8').then(JSON.parse);
  const [registry, product, manifest] = await Promise.all([
    read('.github/release-platforms.json'), read('package.json'), read('releases/update-manifest.json')
  ]);
  if (manifest.releases?.some(release => release.version === product.version)) {
    throw new Error('Choose the new product version before preparing its release intent; published history stays unchanged');
  }
  const publicationMode = manifest.desktopUpdater?.compatibilityBridgeVersion ? 'scoped' : 'bridge';
  const intent = createReleaseIntent({ registry, version: product.version, publicationMode, platforms, compatibility });
  if (write) await writeFile(path.join(root, '.github/release-intent.json'), `${JSON.stringify(intent, null, 2)}\n`);
  return intent;
}

export function parseReleaseIntentArgs(args) {
  const result = { write: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write') { if (result.write) throw new Error('Duplicate --write'); result.write = true; continue; }
    const key = { '--platforms': 'platforms', '--sync': 'mode', '--basis': 'basis' }[arg];
    if (!key || result[key] !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('Use --platforms <ids> --sync <compatible|coordinated> --basis <evidence> [--write]');
    }
    result[key] = args[++index];
  }
  return { write: result.write, platforms: result.platforms?.split(','),
    compatibility: result.mode ? { mode: result.mode, basis: result.basis } : undefined };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    assertQualityCommandAllowed('release:intent');
    console.log(JSON.stringify(await prepareDefaultReleaseIntent(process.cwd(), parseReleaseIntentArgs(process.argv.slice(2))), null, 2));
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
