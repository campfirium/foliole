import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const COMMAND_TIMEOUT_MS = 20 * 60_000;
const PACKAGE_TIMEOUT_MS = 30 * 60_000;
const STATE_DIR = 'windows-desktop-dnssd-fixed-runtime';

function digest(filePath, fsApi = fs) {
  return createHash('sha256').update(fsApi.readFileSync(filePath)).digest('hex');
}

async function gitValue(execute, paths, args, stage) {
  const result = await execute(paths.gitPath, ['-C', paths.repoRoot, ...args], {
    cwd: paths.repoRoot, timeoutCode: `${stage}_timeout`, timeoutMs: 30_000,
    windowsHide: true
  });
  if (result.code !== 0) throw Object.assign(new Error(`${stage} failed`), { stage });
  return result.stdout.trim();
}

export function fixedRuntimePaths(paths) {
  const stateRoot = path.join(paths.repoRoot, '.tmp', STATE_DIR);
  return { markerPath: path.join(stateRoot, 'receipt.json'), stateRoot };
}

export async function inspectFixedRuntimeSource(execute, paths) {
  const [branch, revision, remoteRevision, status, tree] = await Promise.all([
    gitValue(execute, paths, ['branch', '--show-current'], 'source-branch'),
    gitValue(execute, paths, ['rev-parse', 'HEAD'], 'source-revision'),
    gitValue(execute, paths, ['rev-parse', 'origin/dev'], 'source-remote-revision'),
    gitValue(execute, paths, ['status', '--porcelain', '--untracked-files=all'], 'source-status'),
    gitValue(execute, paths, ['rev-parse', 'HEAD^{tree}'], 'source-tree')
  ]);
  if (branch !== 'dev' || status || revision !== remoteRevision) {
    throw Object.assign(new Error('Windows fixed runtime requires clean dev at origin/dev.'), {
      stage: 'source-state'
    });
  }
  return { lockfileDigest: digest(path.join(paths.repoRoot, 'package-lock.json')),
    revision, tree };
}

export function fixedRuntimeCommands(paths) {
  return [
    { args: [paths.systemNpmCli, 'ci'], bin: paths.systemNode, stage: 'dependencies' },
    { args: [path.join(paths.repoRoot, 'node_modules', 'electron', 'install.js')],
      bin: paths.systemNode, stage: 'electron-runtime' },
    { args: [paths.systemNpmCli, 'run', 'build'], bin: paths.systemNode, stage: 'build' },
    { args: [paths.systemNpmCli, 'run', 'electron:compile'],
      bin: paths.systemNode, stage: 'electron-compile' },
    { args: [paths.systemNpmCli, 'run', 'electron:rebuild:native'],
      bin: paths.systemNode, stage: 'native-rebuild' },
    { args: [path.join(paths.repoRoot, 'scripts', 'desktop', 'desktop-dnssd-native-probe.cjs')],
      bin: path.join(paths.repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
      stage: 'native-probe' },
    { args: [paths.systemNpmCli, 'run', 'windows:package'], bin: paths.systemNode,
      stage: 'package-smoke', timeoutMs: PACKAGE_TIMEOUT_MS }
  ].map((command) => ({ ...command, cwd: paths.repoRoot }));
}

async function runCommand(command, execute, logPath, fsApi) {
  const result = await execute(command.bin, command.args, {
    cwd: command.cwd, timeoutCode: `${command.stage}_timeout`,
    timeoutMs: command.timeoutMs ?? COMMAND_TIMEOUT_MS, windowsHide: true
  });
  fsApi.appendFileSync(logPath, `\n[${command.stage}]\n${result.output ?? ''}`, 'utf8');
  if (result.code !== 0) throw Object.assign(
    new Error(`${command.stage} failed with exit ${result.code}`),
    { exitCode: result.code, stage: command.stage }
  );
}

function writeReceipt(filePath, receipt, fsApi) {
  fsApi.mkdirSync(path.dirname(filePath), { recursive: true });
  fsApi.writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

export async function prepareWindowsDesktopDnsSdFixedRuntime({
  buildIdentity, evidenceRoot, execute, fsApi = fs, paths
}) {
  const source = await inspectFixedRuntimeSource(execute, paths);
  const logPath = path.join(evidenceRoot, 'desktop-dnssd-route-prepare.log');
  const receiptPath = path.join(evidenceRoot, 'desktop-dnssd-route-prepare-receipt.json');
  fsApi.writeFileSync(logPath, '', 'utf8');
  try {
    for (const command of fixedRuntimeCommands(paths)) {
      await runCommand(command, execute, logPath, fsApi);
    }
    const receipt = { buildIdentity, completedAt: new Date().toISOString(),
      resultStatus: 'success', schemaVersion: 1, source };
    writeReceipt(receiptPath, receipt, fsApi);
    writeReceipt(fixedRuntimePaths(paths).markerPath, receipt, fsApi);
    return { desktopDnsSdRoutePrepare: { manifestPath: receiptPath }, output: '' };
  } catch (error) {
    const receipt = { buildIdentity, completedAt: new Date().toISOString(),
      failure: { message: error.message, stage: error.stage ?? 'prepare' },
      resultStatus: 'failed', schemaVersion: 1, source };
    writeReceipt(receiptPath, receipt, fsApi);
    throw Object.assign(error, { desktopDnsSdRoutePrepare: { manifestPath: receiptPath } });
  }
}

export async function assertWindowsDesktopDnsSdFixedRuntime({ execute, fsApi = fs, paths }) {
  const markerPath = fixedRuntimePaths(paths).markerPath;
  if (!fsApi.existsSync(markerPath)) throw Object.assign(
    new Error('Windows desktop DNS-SD fixed runtime is not prepared.'), { stage: 'runtime-marker' }
  );
  const receipt = JSON.parse(fsApi.readFileSync(markerPath, 'utf8'));
  const source = await inspectFixedRuntimeSource(execute, paths);
  if (receipt.resultStatus !== 'success' || receipt.source?.revision !== source.revision
      || receipt.source?.tree !== source.tree
      || receipt.source?.lockfileDigest !== source.lockfileDigest) {
    throw Object.assign(new Error('Windows desktop DNS-SD fixed runtime is stale.'), {
      stage: 'runtime-marker'
    });
  }
  for (const filePath of [
    path.join(paths.repoRoot, 'dist', 'electron', 'main.js'),
    path.join(paths.repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  ]) if (!fsApi.existsSync(filePath)) throw Object.assign(
    new Error(`Windows desktop DNS-SD fixed runtime file is missing: ${filePath}`), {
      stage: 'runtime-marker'
    }
  );
  return receipt;
}
