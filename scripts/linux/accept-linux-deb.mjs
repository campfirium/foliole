#!/usr/bin/env node
/* global console, process */

import { existsSync } from 'node:fs';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertDebMetadata, linuxDebName, verifyLinuxDebDirectory } from './linux-deb-contract.mjs';

const EVIDENCE_DIRECTORY = path.resolve('.tmp/artifacts/linux-deb-acceptance');
const USER_DATA_SENTINEL = path.join(EVIDENCE_DIRECTORY, 'preserved-user-data', 'library-sentinel');
const CODEX_FIXTURE = path.join(EVIDENCE_DIRECTORY, 'external-codex-fixture.mjs');
const CODEX_PATH_FIXTURE = path.join(EVIDENCE_DIRECTORY, 'codex');
const INCOMPATIBLE_CODEX_FIXTURE = path.join(EVIDENCE_DIRECTORY, 'incompatible-codex');
const MDNS_INTERFACE_A = 'foliole-mdns0';
const MDNS_INTERFACE_A_CIDR = '192.0.2.1/30';
const MDNS_INTERFACE_B = 'foliole-mdns1';
const MDNS_INTERFACE_B_ADDRESS = '192.0.2.2';
const MDNS_INTERFACE_B_CIDR = '192.0.2.2/30';
const MDNS_NAMESPACE = 'foliole-mdns-peer';
const CODEX_FIXTURE_SOURCE = `#!${process.execPath}
if (process.argv.includes('--version')) {
  console.log('codex-cli 0.0.0-linux-acceptance');
  process.exit(0);
}
process.stdin.setEncoding('utf8');
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
  const lines = input.split(/\\r?\\n/u);
  input = lines.pop() ?? '';
  for (const line of lines) {
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === 'initialize') console.log(JSON.stringify({ id: message.id, result: {} }));
    if (message.method === 'account/read') {
      const authenticated = process.env.FOLIOLE_CODEX_FIXTURE_AUTH !== 'missing';
      console.log(JSON.stringify({ id: message.id, result: authenticated
        ? { account: { type: 'chatgpt' }, requiresOpenaiAuth: true }
        : { account: null, requiresOpenaiAuth: true } }));
    }
  }
});
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', env: options.env ?? process.env, shell: false,
    input: options.input,
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
    './opt/Foliole/resources/apparmor-profile',
    './usr/share/applications/foliole.desktop'
  ]) {
    if (!contents.includes(required)) throw new Error(`Linux DEB is missing ${required}`);
  }
  for (const forbidden of [
    './opt/Foliole/bin/codex',
    './opt/Foliole/codex',
    'app-update.yml',
    'foliole-global-capture.desktop',
    'foliole-global-clip',
    'latest-linux.yml',
    'package-type'
  ]) {
    if (contents.includes(forbidden)) throw new Error(`Linux DEB must not contain ${forbidden}`);
  }
}

function assertPackageContents(debPath) {
  assertDebContents(run('dpkg-deb', ['--contents', debPath], { capture: true }));
}

function assertInstalledIntegration() {
  const commandTarget = run('readlink', ['/usr/bin/foliole'], { capture: true });
  if (commandTarget !== '/opt/Foliole/bin/foliole') throw new Error('Linux CLI link is not package managed');
  const desktop = run('sed', ['-n', '1,120p', '/usr/share/applications/foliole.desktop'], { capture: true });
  if (!desktop.includes('Exec=/opt/Foliole/foliole')) throw new Error('Linux desktop entry points outside /opt/Foliole');
  for (const unsupported of [
    '/opt/Foliole/bin/codex',
    '/opt/Foliole/codex',
    '/usr/bin/foliole-global-clip',
    '/usr/share/applications/foliole-global-capture.desktop'
  ]) {
    if (existsSync(unsupported)) throw new Error(`Linux package installed unsupported Wayland capture path ${unsupported}`);
  }
  run('/usr/bin/foliole', ['--help']);
  run('cmp', ['/opt/Foliole/resources/apparmor-profile', '/etc/apparmor.d/foliole']);
}

function startSecretServiceSession() {
  const output = run('gnome-keyring-daemon', ['--unlock', '--components=secrets'], {
    capture: true,
    input: '\n'
  });
  return Object.fromEntries(output.split('\n').flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*?);?$/u.exec(line.trim());
    return match ? [[match[1], match[2]]] : [];
  }));
}

export function withLinuxMdnsAcceptanceInterface(work, execute = run) {
  execute('sudo', ['ip', 'netns', 'add', MDNS_NAMESPACE]);
  try {
    execute('sudo', ['ip', 'link', 'add', MDNS_INTERFACE_A, 'type', 'veth',
      'peer', 'name', MDNS_INTERFACE_B]);
    try {
      execute('sudo', ['ip', 'link', 'set', MDNS_INTERFACE_B, 'netns', MDNS_NAMESPACE]);
      execute('sudo', ['ip', 'address', 'add', MDNS_INTERFACE_A_CIDR, 'dev', MDNS_INTERFACE_A]);
      execute('sudo', ['ip', 'link', 'set', 'dev', MDNS_INTERFACE_A, 'multicast', 'on', 'up']);
      execute('sudo', ['ip', 'netns', 'exec', MDNS_NAMESPACE,
        'ip', 'address', 'add', MDNS_INTERFACE_B_CIDR, 'dev', MDNS_INTERFACE_B]);
      execute('sudo', ['ip', 'netns', 'exec', MDNS_NAMESPACE,
        'ip', 'link', 'set', 'dev', MDNS_INTERFACE_B, 'multicast', 'on', 'up']);
      return work();
    } finally {
      execute('sudo', ['ip', 'link', 'delete', MDNS_INTERFACE_A]);
    }
  } finally {
    execute('sudo', ['ip', 'netns', 'delete', MDNS_NAMESPACE]);
  }
}

function runPackagedAcceptance(version) {
  const env = {
    ...process.env,
    ...startSecretServiceSession(),
    FOLIOLE_DESKTOP_ACCEPTANCE_EVIDENCE: '1',
    FOLIOLE_ELECTRON_APP_ROOT: '/opt/Foliole',
    FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: '/opt/Foliole/foliole',
    FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
    FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
    FOLIOLE_CODEX_COMMAND: CODEX_FIXTURE,
    FOLIOLE_CODEX_PATH_FIXTURE_DIR: EVIDENCE_DIRECTORY,
    FOLIOLE_LINUX_EXPECTED_VERSION: version,
    FOLIOLE_LINUX_MDNS_NAMESPACE: MDNS_NAMESPACE,
    FOLIOLE_LINUX_MDNS_PEER_ADDRESS: MDNS_INTERFACE_B_ADDRESS,
    FOLIOLE_LINUX_MDNS_ROOT_INTERFACE: MDNS_INTERFACE_A,
    XDG_CURRENT_DESKTOP: 'GNOME'
  };
  withLinuxMdnsAcceptanceInterface(() => run(process.execPath, [
    'scripts/with-resource-gate.mjs', 'preview', '--',
    'xvfb-run', '--auto-servernum', process.execPath, 'node_modules/playwright/cli.js',
    'test', '--config', 'playwright.desktop.config.ts',
    'tests/desktop/linux-deb-core.spec.ts', 'tests/desktop/linux-deb-external-capabilities.spec.ts',
    'tests/desktop/rc-golden-journey.spec.ts'
  ], { env }));
}

async function assertRemovedPackageFiles() {
  for (const removed of ['/opt/Foliole', '/usr/bin/foliole', '/usr/share/applications/foliole.desktop', '/etc/apparmor.d/foliole']) {
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
  await writeFile(CODEX_FIXTURE, CODEX_FIXTURE_SOURCE);
  await writeFile(CODEX_PATH_FIXTURE, CODEX_FIXTURE_SOURCE);
  await writeFile(INCOMPATIBLE_CODEX_FIXTURE, '#!/bin/sh\nexit 23\n');
  await chmod(CODEX_FIXTURE, 0o700);
  await chmod(CODEX_PATH_FIXTURE, 0o700);
  await chmod(INCOMPATIBLE_CODEX_FIXTURE, 0o700);
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
