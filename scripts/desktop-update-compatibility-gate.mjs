#!/usr/bin/env node
/* global console, process */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { assertQualityCommandAllowed } from './quality/quality-command-contracts.mjs';

function readArg(name, argv = process.argv.slice(2)) {
  return argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export function resolveCompatibilityGateArgs(argv, platform = process.platform) {
  const directory = readArg('directory', argv);
  const targetVersion = readArg('target-version', argv);
  const currentVersion = readArg('current-version', argv);
  if (!directory || !targetVersion || !currentVersion) {
    throw new Error('--directory, --current-version, and --target-version are required.');
  }
  if (!['darwin', 'win32'].includes(platform)) {
    throw new Error(`desktop updater compatibility gate does not support ${platform}.`);
  }
  return { currentVersion, directory: path.resolve(directory), platform, targetVersion };
}

async function listen(server) {
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('update fixture server has no TCP address.');
  return `http://127.0.0.1:${address.port}`;
}

function createArtifactServer(directory) {
  return createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname.slice(1));
      if (!name || name.includes('/') || name.includes('\\')) throw new Error('invalid artifact path');
      const filePath = path.join(directory, name);
      const fileStat = await stat(filePath);
      response.writeHead(200, { 'Accept-Ranges': 'bytes', 'Content-Length': fileStat.size });
      if (request.method === 'HEAD') response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
}

function createAppAdapter({ currentVersion, root, updateConfig }) {
  return {
    appUpdateConfigPath: updateConfig,
    baseCachePath: path.join(root, 'cache'),
    isPackaged: true,
    name: 'Foliole',
    onQuit: () => {},
    quit: () => {},
    relaunch: () => {},
    userDataPath: path.join(root, 'user-data'),
    version: currentVersion,
    whenReady: async () => {}
  };
}

async function createUpdater({ currentVersion, platform, root, updateConfig, url }) {
  const [module, builder, runtime] = await Promise.all([
    import('electron-updater'),
    import('builder-util'),
    import('builder-util-runtime')
  ]);
  class DownloadHttpExecutor extends builder.NodeHttpExecutor {
    async download(downloadUrl, destination, options) {
      return options.cancellationToken.createPromise((resolvePromise, reject, onCancel) => {
        const requestOptions = { headers: options.headers || undefined };
        runtime.configureRequestUrl(downloadUrl, requestOptions);
        runtime.configureRequestOptions(requestOptions);
        this.doDownload(requestOptions, {
          callback: (error) => error ? reject(error) : resolvePromise(destination),
          destination,
          onCancel,
          options,
          responseHandler: null
        }, 0);
      });
    }
  }
  class DownloadOnlyMacUpdater extends module.AppUpdater {
    async doDownloadUpdate(downloadUpdateOptions) {
      const provider = downloadUpdateOptions.updateInfoAndProvider.provider;
      const files = provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info);
      const fileInfo = files.find((entry) => entry.url.pathname.toLowerCase().endsWith('.zip'));
      if (!fileInfo) throw new Error('macOS updater metadata does not resolve a ZIP payload.');
      return this.executeDownload({
        done: async (event) => this.dispatchUpdateDownloaded(event),
        downloadUpdateOptions,
        fileExtension: 'zip',
        fileInfo,
        task: async (destinationFile, downloadOptions) => {
          await this.httpExecutor.download(fileInfo.url, destinationFile, downloadOptions);
        }
      });
    }
  }
  const Updater = platform === 'darwin' ? DownloadOnlyMacUpdater : module.NsisUpdater;
  const updater = new Updater(null, createAppAdapter({
    currentVersion, root, updateConfig
  }));
  updater.httpExecutor = new DownloadHttpExecutor();
  updater.setFeedURL({ provider: 'generic', url });
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.disableDifferentialDownload = true;
  updater.logger = console;
  updater.on('error', (error) => {
    console.error(`[desktop-update-compatibility] updater error: ${error instanceof Error ? error.message : String(error)}`);
  });
  return updater;
}

export async function runCompatibilityGate(options) {
  const temporaryParent = path.resolve(process.env.RUNNER_TEMP ?? '.tmp');
  await mkdir(temporaryParent, { recursive: true });
  const root = await mkdtemp(path.join(temporaryParent, 'foliole-update-gate-'));
  const updateConfig = path.join(root, 'app-update.yml');
  const publisher = (process.env.FOLIOLE_UPDATE_PUBLISHER_NAME ??
    process.env.ARTIFACT_SIGNING_PUBLISHER_NAME)?.trim();
  const publisherConfig = publisher ? `publisherName:\n  - ${JSON.stringify(publisher)}\n` : '';
  await writeFile(updateConfig, `updaterCacheDirName: foliole-update-gate\n${publisherConfig}`);
  const server = createArtifactServer(options.directory);
  try {
    const url = await listen(server);
    const updater = await createUpdater({ ...options, root, updateConfig, url });
    const check = await updater.checkForUpdates();
    if (check?.updateInfo?.version !== options.targetVersion) {
      throw new Error(`updater resolved ${check?.updateInfo?.version ?? '<none>'}; expected ${options.targetVersion}.`);
    }
    const downloaded = await updater.downloadUpdate();
    if (!Array.isArray(downloaded) || downloaded.length === 0) {
      throw new Error('updater did not return a downloaded payload.');
    }
    return { downloaded: downloaded.map((entry) => path.basename(entry)), targetVersion: options.targetVersion };
  } finally {
    await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    await rm(root, { force: true, recursive: true });
  }
}

async function main() {
  assertQualityCommandAllowed('runner:desktop-update-release-gate');
  const options = resolveCompatibilityGateArgs(process.argv.slice(2));
  const result = await runCompatibilityGate(options);
  console.log(`[desktop-update-compatibility] status: VERIFIED from=${options.currentVersion} to=${result.targetVersion} payload=${result.downloaded.join(',')}`);
}

export async function runCompatibilityGateCli(execute, runtime = process, logger = console) {
  try {
    await execute();
    runtime.exitCode = 0;
  } catch (error) {
    logger.error(`[desktop-update-compatibility] ${error instanceof Error ? error.message : String(error)}`);
    runtime.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await runCompatibilityGateCli(main);
}
