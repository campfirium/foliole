import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { assertNodeModulesUnoccupied, importWindowsNpmBundle } from './windows-npm-offline-import.mjs';

const MARKER = ['.tmp', 'remote-preflight', 'dependencies.json'];
// The Mac controller places the checksummed Electron archive here, as for internal-install.
export const WINDOWS_PREFLIGHT_RUNTIME_ROOT = '.tmp/artifacts/windows-remote-preflight-runtime';
const HEADER_FILES = ['installVersion', path.join('include', 'node', 'common.gypi'),
  path.join('x64', 'node.lib')];

function readMarker(fsApi, file) {
  try {
    return JSON.parse(fsApi.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function installedStamp(fsApi, repoRoot) {
  try {
    return fsApi.statSync(path.join(repoRoot, 'node_modules', '.package-lock.json')).mtimeMs;
  } catch {
    return null;
  }
}

// Same offline route as internal-install: npm tarballs from the Mac bundle without install
// scripts, the transferred Electron archive, then a from-source native rebuild
// that cannot fetch prebuilt binaries.
export function windowsPreflightDependencyCommands(paths) {
  return [
    { args: [paths.systemNpmCli, 'ci', '--offline', '--ignore-scripts'], stage: 'dependencies',
      timeoutMs: 45 * 60_000 },
    { args: [path.join(paths.repoRoot, 'scripts', 'windows', 'windows-electron-offline-prepare.mjs'),
      WINDOWS_PREFLIGHT_RUNTIME_ROOT, '--native-headers'], stage: 'dependencies-electron', timeoutMs: 20 * 60_000 },
    { args: [paths.systemNpmCli, 'exec', '--offline', '--', 'electron-rebuild', '-f',
      '--build-from-source', '-w', 'better-sqlite3,@foliole/desktop-dnssd'],
    before: assertCachedElectronHeaders, stage: 'dependencies-native', timeoutMs: 20 * 60_000 }
  ];
}

// node-gyp downloads Electron headers unless this exact version is already in
// the per-user cache, so a missing cache fails here instead of reaching out.
export function assertCachedElectronHeaders({ fsApi, home = os.homedir(), paths }) {
  const manifest = JSON.parse(fsApi.readFileSync(
    path.join(paths.repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8'));
  const root = path.join(home, '.electron-gyp', manifest.version);
  const missing = HEADER_FILES.filter((file) => !fsApi.existsSync(path.join(root, file)));
  if (missing.length > 0) {
    throw Object.assign(new Error(`Electron ${manifest.version} headers are not cached at ${root}; `
      + 'refusing to download them'), { stage: 'dependencies-native' });
  }
}

// npm prints the cause on `npm error` lines and failed cleanups as E-codes.
export function npmFailureLines(output) {
  return output.split(/\r?\n/u).filter((line) => (/^npm error (?!A complete log)/u.test(line)
    || /^npm warn cleanup\s+\[Error: E[A-Z]+/u.test(line))).map((line) => line.trim().slice(0, 300))
    .slice(0, 8);
}

// Installs the locked dependencies only when the lock or the installed tree
// changed since this action last materialized them; any other action that
// reinstalls node_modules moves the installed stamp and forces a refresh.
export async function ensureWindowsPreflightDependencies({ execute, fsApi, home, paths }) {
  const lock = fsApi.readFileSync(path.join(paths.repoRoot, 'package-lock.json'));
  const lockSha256 = createHash('sha256').update(lock).digest('hex');
  const markerPath = path.join(paths.repoRoot, ...MARKER);
  const marker = readMarker(fsApi, markerPath);
  const stamp = installedStamp(fsApi, paths.repoRoot);
  if (stamp !== null && marker?.lockSha256 === lockSha256 && marker.installedStamp === stamp) {
    return { installed: false, lockSha256, output: '' };
  }
  await assertNodeModulesUnoccupied({ execute, paths });
  const bundle = await importWindowsNpmBundle({ execute, fsApi, paths });
  let output = bundle.output;
  for (const command of windowsPreflightDependencyCommands(paths)) {
    command.before?.({ fsApi, home, paths });
    const result = await execute(paths.systemNode, command.args, {
      cwd: paths.repoRoot, timeoutCode: `${command.stage}_timeout`, timeoutMs: command.timeoutMs,
      windowsHide: true
    });
    output += result.output ?? '';
    if (result.code !== 0) {
      const causes = npmFailureLines(result.output ?? '');
      throw Object.assign(new Error(`${command.stage} exited ${result.code}`
        + `${causes.length ? `: ${causes.join(' | ')}` : ''}`), { output, stage: command.stage });
    }
  }
  fsApi.mkdirSync(path.dirname(markerPath), { recursive: true });
  fsApi.writeFileSync(markerPath, `${JSON.stringify({
    installedStamp: installedStamp(fsApi, paths.repoRoot), lockSha256
  }, null, 2)}\n`, 'utf8');
  return { installed: true, lockSha256, output };
}
