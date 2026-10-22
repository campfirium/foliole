import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { verifyOfflineElectronArchive } from './windows-electron-offline-prepare.mjs';
import { transferWindowsNpmBundle } from './windows-npm-offline-bundle.mjs';
import { windowsDevTransportIdentity } from './windows-dev-remote-spec.mjs';

export async function prepareWindowsInternalRuntime({ repoRoot, revision, executeGit,
  executeScp, host, env, download, fsApi = fs, transferNpm = transferWindowsNpmBundle }) {
  const source = revision ?? 'refs/heads/dev';
  const lock = JSON.parse(await executeGit(['show', `${source}:package-lock.json`],
    { cwd: repoRoot }));
  const require = createRequire(path.join(repoRoot, 'package.json'));
  const electronRoot = path.dirname(require.resolve('electron/package.json'));
  const electronRequire = createRequire(path.join(electronRoot, 'package.json'));
  const { version } = electronRequire('./package.json');
  if (version !== lock.packages['node_modules/electron'].version) {
    throw new Error('Mac Electron package must match the pinned Windows candidate before offline preparation');
  }
  const filename = `electron-v${version}-win32-x64.zip`;
  const checksums = electronRequire('./checksums.json');
  const archive = path.join(repoRoot, '.tmp', 'artifacts', filename);
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  if (!fs.existsSync(archive)) {
    const downloadArtifact = download ?? electronRequire('@electron/get').downloadArtifact;
    const cached = await downloadArtifact({ version, artifactName: 'electron',
      platform: 'win32', arch: 'x64', checksums });
    verifyOfflineElectronArchive(cached, checksums[filename]);
    fs.copyFileSync(cached, archive);
  }
  verifyOfflineElectronArchive(archive, checksums[filename]);
  const transport = windowsDevTransportIdentity({ env, home: os.homedir(), host, fsApi });
  await executeScp(['-q', ...transport.options, archive,
    `${host}:D:/C/foliole/.tmp/artifacts/${filename}`], { env });
  // Windows installs dependencies with `npm ci --offline`, so every locked
  // tarball of the same candidate travels with the Electron archive.
  await transferNpm({ env, executeScp, fsApi, home: os.homedir(), host, repoRoot, revision: source,
    transport: windowsDevTransportIdentity });
  return { archive, version };
}
