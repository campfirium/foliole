/* global console, process */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { prepareCodexHelper } from './prepare-codex-helper.mjs';
import { prepareGlobalCaptureHelper } from './prepare-global-capture-helper.mjs';

export { prepareCodexHelper } from './prepare-codex-helper.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PROFILE_NAMES = {
  distribution: 'Foliole Mac App Store Connect 2026',
  development: 'Foliole macOS App Development 2026'
};

export function createMasBuilderConfig(base, options) {
  const portableBase = { ...base };
  delete portableBase.electronDist;
  const target = options.mode === 'development' ? 'mas-dev' : 'mas';
  const common = {
    appId: 'com.campfirium.foliole',
    binaries: ['Contents/MacOS/codex', 'Contents/MacOS/Foliole Global Capture'],
    entitlements: 'build/entitlements.mas.plist',
    entitlementsInherit: 'build/entitlements.mas.inherit.plist',
    forceCodeSigning: true,
    hardenedRuntime: true,
    provisioningProfile: options.provisioningProfile,
    sign: 'scripts/macos/sign-mas-app.mjs'
  };
  return {
    ...portableBase,
    appId: 'com.campfirium.foliole',
    directories: { ...base.directories, output: 'artifacts/macos' },
    extraFiles: [
      ...(base.extraFiles ?? []),
      { from: options.codexPath, to: 'MacOS/codex' },
      { from: options.globalCaptureHelperPath, to: 'MacOS/Foliole Global Capture' }
    ],
    extraResources: [
      ...base.extraResources,
      { from: 'build/macos/codex-NOTICE.txt', to: 'codex/NOTICE.txt' },
      { from: 'LICENSE', to: 'codex/LICENSE' }
    ],
    mac: {
      ...base.mac,
      artifactName: '${productName}-${version}-mac-${arch}.${ext}',
      target: [target]
    },
    mas: { ...common },
    masDev: { ...common }
  };
}

export function cleanMasElectronOutput(root = ROOT, remove = rm) {
  return remove(path.join(root, 'dist', 'electron'), { force: true, recursive: true });
}

export function findProvisioningProfile(name) {
  const profilesDirectory = path.join(process.env.HOME ?? '', 'Library/Developer/Xcode/UserData/Provisioning Profiles');
  const listing = execFileSync('find', [profilesDirectory, '-name', '*.provisionprofile', '-type', 'f'], { encoding: 'utf8' });
  const matches = [];
  for (const candidate of listing.trim().split('\n').filter(Boolean)) {
    const metadata = readProvisioningProfileMetadata(candidate);
    if (metadata?.name === name) matches.push({ candidate, createdAt: metadata.createdAt });
  }
  matches.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  if (matches[0]) return matches[0].candidate;
  throw new Error(`Provisioning profile not found in Xcode: ${name}`);
}

export function readProvisioningProfileMetadata(candidate, run = execFileSync) {
  try {
    const decoded = decodeProvisioningProfile(candidate, run);
    const readField = (field) => run('plutil', ['-extract', field, 'raw', '-o', '-', '-'], {
      input: decoded,
      encoding: 'utf8'
    }).trim();
    return { createdAt: readField('CreationDate'), name: readField('Name') };
  } catch {
    return null;
  }
}

function decodeProvisioningProfile(candidate, run) {
  try {
    return run('security', ['cms', '-D', '-i', candidate], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return run('openssl', ['smime', '-verify', '-inform', 'DER', '-noverify', '-in', candidate], {
      stdio: ['ignore', 'pipe', 'ignore']
    });
  }
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Mac App Store packaging requires an arm64 Mac');
  }
  const mode = process.argv.includes('--distribution') ? 'distribution' : 'development';
  const codexPath = await prepareCodexHelper();
  const globalCaptureHelperPath = await prepareGlobalCaptureHelper();
  const provisioningProfile = findProvisioningProfile(PROFILE_NAMES[mode]);
  const base = JSON.parse(await readFile(path.join(ROOT, 'electron/builder.json'), 'utf8'));
  const config = createMasBuilderConfig(base, {
    codexPath,
    mode,
    globalCaptureHelperPath,
    provisioningProfile
  });
  const configPath = path.join(ROOT, `.tmp/electron-builder-${mode}.json`);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await cleanMasElectronOutput();
  for (const [label, command, args] of [
    ['build', 'npm', ['run', 'build']],
    ['electron compile', 'npm', ['run', 'electron:compile']],
    ['electron-builder', 'npm', ['exec', '--', 'electron-builder', '--config', configPath, '--mac', mode === 'development' ? 'mas-dev' : 'mas', '--arm64', '--publish', 'never']]
  ]) {
    const result = spawnSync(command, args, { cwd: ROOT, env: process.env, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
