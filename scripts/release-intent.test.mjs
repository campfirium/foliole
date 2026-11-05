// @vitest-environment node
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareDefaultReleaseIntent } from './release-intent.mjs';
import { parseReleaseIntentArgs } from './release-intent.mjs';
import { resolveReleasePlatformIdentity } from './release-platform-contract.mjs';
import { execFileSync } from 'node:child_process';

const registry = JSON.parse(fs.readFileSync('.github/release-platforms.json'));
const roots = [];
afterEach(() => { roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });
function fixture() {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/release-intent-')); roots.push(root);
  fs.mkdirSync(path.join(root, '.github')); fs.mkdirSync(path.join(root, 'releases'));
  const files = { '.github/release-platforms.json': registry, 'package.json': { version: '0.7.18' },
    'releases/update-manifest.json': { latest: '0.7.17', desktopUpdater: { compatibilityBridgeVersion: '0.7.17' },
      releases: [{ version: '0.7.17', platforms: ['macos', 'windows', 'linux'] }] } };
  for (const [file, value] of Object.entries(files)) fs.writeFileSync(path.join(root, file), JSON.stringify(value));
  return root;
}
const compatible = { mode: 'compatible', basis: 'Windows-only installer fix; existing data and sync contracts remain compatible.' };

it('prepares and writes only Windows for a compatible Windows-only release without rewriting history', async () => {
  const root = fixture();
  const file = path.join(root, '.github/release-intent.json'); fs.writeFileSync(file, 'existing intent');
  const history = fs.readFileSync(path.join(root, 'releases/update-manifest.json'), 'utf8');
  const options = { platforms: ['windows'], compatibility: compatible };
  const intent = await prepareDefaultReleaseIntent(root, options);
  expect(intent.selectedPlatforms).toEqual(['windows']);
  expect(intent.syncCompatibility).toEqual(compatible);
  const identity = resolveReleasePlatformIdentity({ registry, intent, packageVersion: '0.7.18', sha: 'a'.repeat(40) });
  expect(identity.hardGatePlatforms).toEqual(['windows']);
  expect(identity.managedAssets.every(asset => !/Android|iOS|macOS|Linux/u.test(asset))).toBe(true);
  expect(fs.readFileSync(file, 'utf8')).toBe('existing intent');
  await prepareDefaultReleaseIntent(root, { ...options, write: true });
  expect(JSON.parse(fs.readFileSync(file))).toEqual(intent);
  expect(fs.readFileSync(path.join(root, 'releases/update-manifest.json'), 'utf8')).toBe(history);
});

it('requires explicit platforms and sync evidence rather than defaulting compatible or unknown changes to every platform', async () => {
  const root = fixture();
  for (const options of [{}, { platforms: ['windows'] }, { platforms: ['windows'], compatibility: { mode: 'compatible' } },
    { platforms: ['windows'], compatibility: { mode: 'unknown', basis: 'Not established' } }]) {
    await expect(prepareDefaultReleaseIntent(root, { ...options, write: true })).rejects.toThrow();
  }
  expect(fs.existsSync(path.join(root, '.github/release-intent.json'))).toBe(false);
});

it('requires all active producers only for an explicit sync-incompatible coordinated release', async () => {
  const root = fixture();
  const compatibility = { mode: 'coordinated', basis: 'New sync facts cannot be consumed by the prior public clients.' };
  await expect(prepareDefaultReleaseIntent(root, { platforms: ['windows'], compatibility })).rejects.toThrow(/every active platform/u);
  const platforms = registry.platforms.filter(platform => platform.status === 'active').map(platform => platform.id);
  expect((await prepareDefaultReleaseIntent(root, { platforms, compatibility })).selectedPlatforms).toEqual(platforms);
});

it('permits a compatible schema change and binds the compatibility assessment into the frozen candidate identity', async () => {
  const root = fixture();
  const intent = await prepareDefaultReleaseIntent(root, { platforms: ['windows'], compatibility: {
    mode: 'compatible', basis: 'Local schema adds an optional index; persisted sync facts and old peers remain compatible.' } });
  const identity = value => resolveReleasePlatformIdentity({ registry, intent: value, packageVersion: '0.7.18', sha: 'a'.repeat(40) });
  expect(intent.selectedPlatforms).toEqual(['windows']);
  expect(identity(intent).digest).not.toBe(identity({ ...intent, syncCompatibility: compatible }).digest);
});

it('uses the real CLI to write a Windows-only intent and rejects missing or duplicate arguments', () => {
  const root = fixture();
  execFileSync(process.execPath, [path.resolve('scripts/release-intent.mjs'), '--platforms', 'windows', '--sync', 'compatible',
    '--basis', compatible.basis, '--write'], { cwd: root, stdio: 'pipe' });
  expect(JSON.parse(fs.readFileSync(path.join(root, '.github/release-intent.json'))).selectedPlatforms).toEqual(['windows']);
  for (const args of [['--platforms'], ['--write', '--write'], ['--sync', 'compatible', '--sync', 'coordinated'], ['--all']]) {
    expect(() => parseReleaseIntentArgs(args)).toThrow();
  }
});
