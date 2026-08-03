#!/usr/bin/env node
/* global console, process */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertDebMetadata, linuxDebName, verifyLinuxDebDirectory } from './linux-deb-contract.mjs';

const EVIDENCE_DIRECTORY = path.resolve('.tmp/artifacts/linux-deb-acceptance');
const USER_DATA_SENTINEL = path.join(EVIDENCE_DIRECTORY, 'preserved-user-data', 'library-sentinel');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', env: options.env ?? process.env, shell: false,
    stdio: options.capture ? 'pipe' : 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
  return result.stdout?.trim() ?? '';
}

export function assertLinuxAcceptanceHost(platform = process.platform, arch = process.arch) {
  if (platform !== 'linux' || arch !== 'x64') throw new Error('Linux DEB acceptance requires Linux x64');
}

function readDebMetadata(debPath) {
  const output = run('dpkg-deb', ['--show', '--showformat=${Package}\n${Version}\n${Architecture}\n', debPath], {
    capture: true
  });
  const [Package, Version, Architecture] = output.split('\n');
  return { Architecture, Package, Version };
}

export function assertDebContents(contents) {
  for (const required of [
    './opt/Foliole/foliole',
    './opt/Foliole/bin/foliole',
    './opt/Foliole/bin/foliole-global-clip',
    './opt/Foliole/resources/apparmor-profile',
    './usr/share/applications/foliole.desktop'
  ]) {
    if (!contents.includes(required)) throw new Error(`Linux DEB is missing ${required}`);
  }
  for (const forbidden of ['app-update.yml', 'latest-linux.yml', 'package-type']) {
    if (contents.includes(forbidden)) throw new Error(`Linux DEB must not contain ${forbidden}`);
  }
}

function assertPackageContents(debPath) {
  assertDebContents(run('dpkg-deb', ['--contents', debPath], { capture: true }));
}

function assertInstalledIntegration() {
  const commandTarget = run('readlink', ['/usr/bin/foliole'], { capture: true });
  if (commandTarget !== '/opt/Foliole/bin/foliole') throw new Error('Linux CLI link is not package managed');
  const clipTarget = run('readlink', ['/usr/bin/foliole-global-clip'], { capture: true });
  if (clipTarget !== '/opt/Foliole/bin/foliole-global-clip') {
    throw new Error('Linux global clip command is not package managed');
  }
  const desktop = run('sed', ['-n', '1,120p', '/usr/share/applications/foliole.desktop'], { capture: true });
  if (!desktop.includes('Exec=/opt/Foliole/foliole')) throw new Error('Linux desktop entry points outside /opt/Foliole');
  run('/usr/bin/foliole', ['--help']);
  run('/usr/bin/python3', [
    '-c', 'import sys; compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec")',
    '/opt/Foliole/bin/foliole-global-clip'
  ]);
  run('cmp', ['/opt/Foliole/resources/apparmor-profile', '/etc/apparmor.d/foliole']);
}

function runPackagedAcceptance(version) {
  const env = {
    ...process.env,
    FOLIOLE_DESKTOP_ACCEPTANCE_EVIDENCE: '1',
    FOLIOLE_ELECTRON_APP_ROOT: '/opt/Foliole',
    FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: '/opt/Foliole/foliole',
    FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
    FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
    FOLIOLE_LINUX_EXPECTED_VERSION: version
  };
  run(process.execPath, [
    'scripts/with-resource-gate.mjs', 'preview', '--',
    'xvfb-run', '--auto-servernum', process.execPath, 'node_modules/playwright/cli.js',
    'test', '--config', 'playwright.desktop.config.ts',
    'tests/desktop/linux-deb-core.spec.ts', 'tests/desktop/rc-golden-journey.spec.ts'
  ], { env });
}

async function assertRemovedPackageFiles() {
  for (const removed of [
    '/opt/Foliole', '/usr/bin/foliole', '/usr/bin/foliole-global-clip',
    '/usr/share/applications/foliole.desktop', '/etc/apparmor.d/foliole'
  ]) {
    await access(removed).then(
      () => { throw new Error(`Linux uninstall left package-owned path ${removed}`); },
      () => undefined
    );
  }
  if ((await readFile(USER_DATA_SENTINEL, 'utf8')) !== 'preserve\n') {
    throw new Error('Linux uninstall removed isolated user data');
  }
}

export async function acceptLinuxDeb({ directory, targetSha, version }) {
  assertLinuxAcceptanceHost();
  const packageResult = await verifyLinuxDebDirectory(directory, version);
  const debPath = path.resolve(directory, linuxDebName(version));
  assertDebMetadata(readDebMetadata(debPath), version);
  assertPackageContents(debPath);
  if (run('git', ['rev-parse', 'HEAD'], { capture: true }) !== targetSha) {
    throw new Error('Linux acceptance SHA does not match checked out target');
  }
  await mkdir(path.dirname(USER_DATA_SENTINEL), { recursive: true });
  await writeFile(USER_DATA_SENTINEL, 'preserve\n');
  run('sudo', ['apt-get', 'install', '-y', debPath]);
  assertInstalledIntegration();
  runPackagedAcceptance(version);
  run('sudo', ['apt-get', 'install', '--reinstall', '-y', debPath]);
  assertInstalledIntegration();
  run('sudo', ['apt-get', 'remove', '-y', 'foliole']);
  await assertRemovedPackageFiles();
  const evidence = { architecture: 'amd64', checksum: packageResult.checksum, deb: packageResult.deb,
    platform: 'linux', sha: targetSha, version };
  await writeFile(path.join(EVIDENCE_DIRECTORY, 'result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const readArg = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  acceptLinuxDeb({
    directory: readArg('directory'), targetSha: readArg('target-sha'), version: readArg('version')
  }).then((evidence) => {
    console.log(`[linux-deb-acceptance] status=PASSED sha=${evidence.sha} version=${evidence.version}`);
  }).catch((error) => {
    console.error(`[linux-deb-acceptance] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
