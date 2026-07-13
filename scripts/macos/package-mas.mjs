/* global Buffer, console, fetch, process */

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CODEX_VERSION = '0.144.3';
const CODEX_ASSET = 'codex-aarch64-apple-darwin.tar.gz';
const CODEX_SHA256 = '249aaf12644add3876e740998cba0eac8d7d175e903add8cbc8d8eaa1f02e2b5';
const CODEX_URL = `https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/${CODEX_ASSET}`;
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
    binaries: ['Contents/MacOS/codex'],
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
      { from: options.codexPath, to: 'MacOS/codex' }
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

export async function prepareCodexHelper() {
  const directory = path.join(ROOT, '.tmp/macos/codex', CODEX_VERSION);
  const archive = path.join(directory, CODEX_ASSET);
  const command = path.join(directory, 'codex');
  await mkdir(directory, { recursive: true });
  if (!await hasExpectedHash(archive, CODEX_SHA256)) {
    await rm(archive, { force: true });
    const response = await fetch(CODEX_URL);
    if (!response.ok) throw new Error(`Codex download failed: HTTP ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  if (!await hasExpectedHash(archive, CODEX_SHA256)) throw new Error('Codex SHA-256 mismatch');
  await rm(command, { force: true });
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  await rename(path.join(directory, 'codex-aarch64-apple-darwin'), command);
  await chmod(command, 0o755);
  return path.relative(ROOT, command);
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

async function hasExpectedHash(file, expected) {
  try {
    const content = await readFile(file);
    return createHash('sha256').update(content).digest('hex') === expected;
  } catch {
    return false;
  }
}

async function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('Mac App Store packaging requires an arm64 Mac');
  }
  const mode = process.argv.includes('--distribution') ? 'distribution' : 'development';
  const codexPath = await prepareCodexHelper();
  const provisioningProfile = findProvisioningProfile(PROFILE_NAMES[mode]);
  const base = JSON.parse(await readFile(path.join(ROOT, 'electron/builder.json'), 'utf8'));
  const config = createMasBuilderConfig(base, { codexPath, mode, provisioningProfile });
  const configPath = path.join(ROOT, `.tmp/electron-builder-${mode}.json`);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
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
