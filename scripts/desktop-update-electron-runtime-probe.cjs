/* global clearTimeout, console, process, setTimeout */

const { createServer } = require('node:http');
const { createReadStream } = require('node:fs');
const { mkdir, stat, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const { app } = require('electron');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function createArtifactServer(directory) {
  return createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname.slice(1));
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

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('update fixture server has no TCP address.');
  return `http://127.0.0.1:${address.port}`;
}

function eventOnce(emitter, name, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${name}.`)), timeoutMs);
    emitter.once(name, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

async function writeUpdateConfig(url) {
  const publisher = (process.env.FOLIOLE_UPDATE_PUBLISHER_NAME ||
    process.env.ARTIFACT_SIGNING_PUBLISHER_NAME || '').trim();
  const publisherConfig = publisher ? `publisherName:\n  - ${JSON.stringify(publisher)}\n` : '';
  await writeFile(
    path.join(app.getAppPath(), 'dev-app-update.yml'),
    `provider: generic\nurl: ${JSON.stringify(url)}\nupdaterCacheDirName: foliole-update-runtime-gate\n${publisherConfig}`
  );
}

async function run() {
  const artifactDirectory = path.resolve(required('FOLIOLE_UPDATE_ARTIFACT_DIRECTORY'));
  const harnessRoot = path.resolve(required('FOLIOLE_UPDATE_HARNESS_ROOT'));
  const targetVersion = required('FOLIOLE_UPDATE_TARGET_VERSION');
  const updaterModule = require(path.resolve(required('FOLIOLE_UPDATER_MODULE')));
  await mkdir(path.join(harnessRoot, 'user-data'), { recursive: true });
  app.setPath('userData', path.join(harnessRoot, 'user-data'));
  app.setPath('cache', path.join(harnessRoot, 'cache'));
  if (app.dock) app.dock.hide();
  await app.whenReady();
  const server = createArtifactServer(artifactDirectory);
  const updater = process.platform === 'darwin'
    ? new updaterModule.MacUpdater()
    : new updaterModule.NsisUpdater();
  try {
    await writeUpdateConfig(await listen(server));
    updater.forceDevUpdateConfig = true;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.disableDifferentialDownload = true;
    updater.logger = console;
    updater.on('error', (error) => console.error(`[desktop-update-electron-runtime] updater error: ${error.message}`));
    const check = await updater.checkForUpdates();
    if (check?.updateInfo?.version !== targetVersion) {
      throw new Error(`updater resolved ${check?.updateInfo?.version || '<none>'}; expected ${targetVersion}.`);
    }
    const downloaded = eventOnce(updater, 'update-downloaded');
    await updater.downloadUpdate();
    const [event] = await downloaded;
    console.log(`[desktop-update-electron-runtime] ${JSON.stringify({
      downloaded: path.basename(event.downloadedFile),
      executor: updater.httpExecutor?.constructor?.name,
      targetVersion: check.updateInfo.version,
      updater: updater.constructor.name
    })}`);
  } finally {
    if (typeof updater.closeServerIfExists === 'function') updater.closeServerIfExists();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().then(() => app.quit()).catch((error) => {
  console.error(`[desktop-update-electron-runtime] ${error instanceof Error ? error.stack : String(error)}`);
  app.exit(1);
});
