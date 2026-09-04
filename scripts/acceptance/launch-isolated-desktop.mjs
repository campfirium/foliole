import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { launchDesktopSession } from '../desktop/playwright-desktop-harness.mjs';

function required(value, label) {
  if (!value?.trim()) throw new Error(`${label} is required`);
  return value.trim();
}
function inside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function parseLaunchConfig(argv, cwd = process.cwd()) {
  const { values } = parseArgs({ args: argv, allowPositionals: false, options: {
    'artifact-root': { type: 'string' }, 'cdp-port': { type: 'string' },
    result: { type: 'string' }, revision: { type: 'string' },
    'state-root': { type: 'string' }
  }, strict: true });
  const repoRoot = path.resolve(cwd);
  const artifactsRoot = path.join(repoRoot, '.tmp', 'artifacts');
  const artifactRoot = path.resolve(required(values['artifact-root'], 'artifact root'));
  const stateRoot = path.resolve(required(values['state-root'], 'state root'));
  const resultPath = path.resolve(required(values.result, 'result'));
  const revision = required(values.revision, 'revision');
  const cdpPort = Number.parseInt(required(values['cdp-port'], 'CDP port'), 10);
  if (!inside(artifactRoot, artifactsRoot)) throw new Error('artifact root must be inside .tmp/artifacts');
  if (!inside(stateRoot, artifactRoot)) throw new Error('state root must be inside artifact root');
  if (!inside(resultPath, artifactRoot)) throw new Error('result must be inside artifact root');
  if (!/^[0-9a-f]{40}$/u.test(revision)) throw new Error('revision must be a full commit hash');
  if (!Number.isInteger(cdpPort) || cdpPort < 1024 || cdpPort > 65535) {
    throw new Error('CDP port must be between 1024 and 65535');
  }
  return { artifactRoot, cdpPort, diagnosticsPath: path.join(stateRoot, 'runtime-diagnostics.json'),
    repoRoot, resultPath, revision, stateRoot };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, ...value }, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

function writeLaunchResult(config, value) { writeJson(config.resultPath, value); }

function waitForStop(runtimeProcess) {
  return new Promise((resolve) => {
    const finish = (reason) => resolve(reason);
    process.once('SIGINT', () => finish('SIGINT'));
    process.once('SIGTERM', () => finish('SIGTERM'));
    runtimeProcess.once('exit', () => finish('runtime-exit'));
  });
}

export async function runIsolatedDesktop(argv = process.argv.slice(2)) {
  const config = parseLaunchConfig(argv);
  const startedAt = new Date().toISOString();
  writeLaunchResult(config, { artifactRoot: config.artifactRoot, revision: config.revision,
    startedAt, stateRoot: config.stateRoot, status: 'starting' });
  let session;
  try {
    session = await launchDesktopSession({ appRoot: config.repoRoot, env: {
      ...process.env,
      FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: config.stateRoot,
      FOLIOLE_REMOTE_DEBUGGING_PORT: String(config.cdpPort)
    } });
    const ready = { appReady: session.appReady, cdpEndpoint: `http://127.0.0.1:${config.cdpPort}`,
      libraryHome: session.launchOptions.env.FOLIOLE_LIBRARY_HOME,
      pid: session.electronApp.process()?.pid, readyAt: new Date().toISOString(),
      artifactRoot: config.artifactRoot, revision: config.revision, startedAt,
      diagnosticsPath: config.diagnosticsPath, stateRoot: config.stateRoot, status: 'ready',
      userDataPath: session.launchOptions.env.FOLIOLE_USER_DATA_PATH, workspaceReady: true };
    writeLaunchResult(config, ready);
    const stopReason = await waitForStop(session.electronApp.process());
    writeJson(config.diagnosticsPath, await session.collectDiagnostics());
    await session.close();
    writeLaunchResult(config, { ...ready, stoppedAt: new Date().toISOString(), stopReason, status: 'stopped' });
    return stopReason === 'runtime-exit' ? 1 : 0;
  } catch (error) {
    const diagnostics = session
      ? await session.collectDiagnostics().catch((diagnosticError) => ({ error: String(diagnosticError) }))
      : error?.desktopDiagnostics;
    if (diagnostics) writeJson(config.diagnosticsPath, diagnostics);
    await session?.close().catch(() => undefined);
    writeLaunchResult(config, { error: error instanceof Error ? error.message : String(error),
      artifactRoot: config.artifactRoot, failedAt: new Date().toISOString(),
      revision: config.revision, startedAt,
      stateRoot: config.stateRoot, status: 'failed' });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runIsolatedDesktop().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`[launch-isolated-desktop] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
