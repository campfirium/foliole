/* global console, process */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertMasDistributionContract } from './distribution-contract.mjs';
import { installMasDevelopmentApp } from './internal-install.mjs';
import {
  assertExternalPackageOutput, publishArtifactBatch, withTemporaryPackageOutput
} from './package-artifact-lifecycle.mjs';
import { assertMasElectronRuntime } from './mas-electron-runtime.mjs';
import { prepareCodexHelper } from './prepare-codex-helper.mjs';
import { prepareGlobalCaptureHelper } from './prepare-global-capture-helper.mjs';
import { verifyPackagedMacosApp } from './verify-packaged-app.mjs';

export { prepareCodexHelper } from './prepare-codex-helper.mjs';
export { installMasDevelopmentApp } from './internal-install.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MAS_PUBLISHED_DIRECTORY = path.join(ROOT, 'artifacts/macos/mas-arm64');
const PROFILE_NAMES = {
  distribution: 'Foliole Mac App Store Connect 2026',
  development: 'Foliole macOS App Development 2026'
};

export function createMasBuilderConfig(base, options) {
  const portableBase = { ...base };
  const outputDirectory = assertExternalPackageOutput(ROOT, options.outputDirectory);
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
  const config = {
    ...portableBase,
    appId: 'com.campfirium.foliole',
    directories: { ...base.directories, output: outputDirectory },
    electronDist: options.electronDist,
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
  assertMasDistributionContract(config, options.mode);
  return config;
}

export function cleanMasElectronOutput(root = ROOT, remove = rm) {
  return remove(path.join(root, 'dist', 'electron'), { force: true, recursive: true });
}

export function resolveInstallMode(argv = process.argv) {
  return argv.includes('--install');
}

export function createMasArtifactName(productName, version, arch = 'arm64') {
  return `${productName}-${version}-mac-${arch}.pkg`;
}

function runStep(label, command, args, run = spawnSync) {
  const result = run(command, args, { cwd: ROOT, env: process.env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
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
  const install = resolveInstallMode();
  if (install && mode !== 'development') throw new Error('Only the MAS development package can be installed locally');
  const codexPath = await prepareCodexHelper();
  const globalCaptureHelperPath = await prepareGlobalCaptureHelper();
  const electronDist = await assertMasElectronRuntime();
  const provisioningProfile = findProvisioningProfile(PROFILE_NAMES[mode]);
  const base = JSON.parse(await readFile(path.join(ROOT, 'electron/builder.json'), 'utf8'));
  const packageMetadata = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const pkgName = createMasArtifactName(base.productName, packageMetadata.version);
  await cleanMasElectronOutput();
  console.log('[macos-package] stage: BUILDING');
  await withTemporaryPackageOutput(async (outputDirectory) => {
    const config = createMasBuilderConfig(base, {
      codexPath, electronDist, globalCaptureHelperPath, mode, outputDirectory, provisioningProfile
    });
    const configPath = path.join(outputDirectory, `electron-builder-${mode}.json`);
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    for (const [label, command, args] of [
      ['build', 'npm', ['run', 'build']],
      ['security bookmark addon', 'npm', ['run', 'macos:security-bookmarks:build']],
      ['electron compile', 'npm', ['run', 'electron:compile']],
      ['electron-builder', 'npm', ['exec', '--', 'electron-builder', '--config', configPath, '--mac', mode === 'development' ? 'mas-dev' : 'mas', '--arm64', '--publish', 'never']]
    ]) {
      runStep(label, command, args);
    }
    const channelDirectory = path.join(outputDirectory, `${mode === 'development' ? 'mas-dev' : 'mas'}-arm64`);
    const appPath = path.join(channelDirectory, 'Foliole.app');
    await verifyPackagedMacosApp({ appPath });
    if (install) await installMasDevelopmentApp({ sourcePath: appPath });
    if (mode === 'distribution') {
      await publishArtifactBatch({
        names: [pkgName], sourceDirectory: channelDirectory, targetDirectory: MAS_PUBLISHED_DIRECTORY
      });
    }
  });
  console.log(`[macos-package] status: ${install ? 'PACKAGED_AND_INSTALLED' : 'PACKAGED'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
