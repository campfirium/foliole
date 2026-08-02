import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function runChecked(label, command, args, run) {
  const result = run(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

export async function verifyPackagedVersion(options) {
  const run = options.run ?? spawnSync;
  const infoPlistPath = path.join(options.appPath, 'Contents/Info.plist');
  const appVersion = runChecked(
    'app version inspection', 'plutil',
    ['-extract', 'CFBundleShortVersionString', 'raw', infoPlistPath], run
  ).stdout.trim();
  if (appVersion !== options.version) {
    throw new Error(`packaged app version is ${appVersion}, expected ${options.version}`);
  }
  const read = options.readFile ?? readFile;
  const cliMetadataPath = path.join(
    options.appPath, 'Contents/Helpers/Foliole CLI.app/Contents/Resources/package.json'
  );
  let cliVersion;
  try {
    cliVersion = JSON.parse(await read(cliMetadataPath, 'utf8')).version;
  } catch {
    throw new Error('packaged CLI metadata is not JSON');
  }
  if (cliVersion !== options.version) {
    throw new Error(`packaged CLI version is ${cliVersion}, expected ${options.version}`);
  }
}
