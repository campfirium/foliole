import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { reconnectAndroidDevice, resolveAndroidDevice } from './windows-android-lab-device.mjs';
import { cleanupAndroidLabCheckout, prepareAndroidLabCheckout } from './windows-android-lab-checkout.mjs';
import { readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const OUTPUT_LIMIT = 1_000_000;
const ENV_KEYS = [
  'ANDROID_USER_HOME', 'ANDROID_WINDOWS_WORKDIR', 'FOLIOLE_ANDROID_ADB_PATH', 'FOLIOLE_ANDROID_BASH_PATH',
  'FOLIOLE_ANDROID_LAB_EVIDENCE_ROOT', 'FOLIOLE_ANDROID_SERIAL', 'JAVA_HOME', 'LOCALAPPDATA', 'PATH', 'Path',
  'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR'
];

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function scopedRoot(scope, paths, evidenceRoot) {
  if (scope === 'checkout') return paths.candidate;
  if (scope === 'lab') return paths.root;
  if (scope === 'run') return evidenceRoot;
  throw codedError('request_cwd_rejected', 'unknown Lab path scope');
}

function resolveWithin(root, relativePath = '') {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw codedError('request_cwd_rejected', 'resolved path escaped its Lab scope');
  }
  return resolved;
}

function boundedText(value) {
  const bytes = Buffer.from(String(value || ''), 'utf8');
  if (bytes.length <= OUTPUT_LIMIT) return bytes.toString('utf8');
  return `[truncated to last ${OUTPUT_LIMIT} bytes]\n${bytes.subarray(bytes.length - OUTPUT_LIMIT).toString('utf8')}`;
}

function auditedArgs(args) {
  return args.map((value, index) => (
    args[index - 1] === '--value' || (args[index - 2] === '-e' && ['value', 'valueBase64'].includes(args[index - 1]))
      ? '<redacted>' : value
  ));
}

function operationEnvironment(config, paths, evidenceRoot, spec) {
  const env = Object.fromEntries(ENV_KEYS.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
  env.JAVA_HOME = config.javaHome;
  const tools = [config.nodeDirectory, path.win32.dirname(config.adbPath)].filter(Boolean).join(';');
  env.Path = `${tools};${env.Path || env.PATH || ''}`;
  env.ANDROID_USER_HOME = paths.signingHome;
  env.ANDROID_WINDOWS_WORKDIR = paths.preview;
  env.FOLIOLE_ANDROID_ADB_PATH = config.adbPath;
  env.FOLIOLE_ANDROID_BASH_PATH = config.bashPath;
  env.FOLIOLE_ANDROID_LAB_EVIDENCE_ROOT = evidenceRoot;
  if (spec.runtimeHead) env.FOLIOLE_RUNTIME_HEAD = spec.runtimeHead;
  if (spec.deviceEndpoint) env.FOLIOLE_ANDROID_SERIAL = spec.deviceEndpoint;
  return env;
}

function repositorySpec(config, paths, operation) {
  const runner = resolveWithin(paths.candidate, operation.runner);
  if (!fs.existsSync(runner) || !fs.statSync(runner).isFile()) throw codedError('request_runner_missing', 'repository runner is missing');
  if (runner.endsWith('.mjs')) return { args: [runner, ...operation.args], command: path.join(config.nodeDirectory, 'node.exe') };
  if (runner.endsWith('.ps1')) return {
    args: ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', runner, ...operation.args],
    command: 'powershell.exe'
  };
  throw codedError('request_runner_rejected', 'repository runner type is unsupported');
}

function diagnosticSpec(config, operation, evidenceRoot) {
  const diagnosticRoot = path.join(evidenceRoot, 'diagnostic');
  fs.mkdirSync(diagnosticRoot, { recursive: true });
  const script = resolveWithin(diagnosticRoot, operation.fileName);
  const content = Buffer.from(operation.contentBase64, 'base64');
  fs.writeFileSync(script, content, { mode: 0o600 });
  if (operation.runtime === 'node') {
    return { args: [script, ...operation.args], command: path.join(config.nodeDirectory, 'node.exe') };
  }
  const encoded = Buffer.from(content.toString('utf8'), 'utf16le').toString('base64');
  return { args: ['-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded, ...operation.args], command: 'powershell.exe' };
}

async function resolveProcessSpec(config, paths, request, evidenceRoot, executeCommand) {
  const operation = request.operation;
  if (operation.kind === 'repository') {
    const spec = repositorySpec(config, paths, operation);
    if (request.target !== 'a5') return spec;
    const device = await resolveAndroidDevice(config, paths, executeCommand);
    return { ...spec, deviceEndpoint: device.endpoint, deviceIdentity: device.identity };
  }
  if (operation.kind === 'windowsClient') return {
    args: [path.join(paths.preview, 'scripts', 'windows', 'windows-client-native.mjs'), operation.action],
    command: path.join(config.nodeDirectory, 'node.exe'), cwd: paths.preview, runtimeHead: request.commitSha
  };
  if (operation.kind === 'diagnostic') {
    const spec = diagnosticSpec(config, operation, evidenceRoot);
    if (request.target !== 'a5') return spec;
    const device = await resolveAndroidDevice(config, paths, executeCommand);
    return { ...spec, deviceEndpoint: device.endpoint, deviceIdentity: device.identity };
  }
  if (operation.kind === 'deviceReconnect') {
    const device = await reconnectAndroidDevice(config, operation.endpoint, paths, executeCommand, 'request');
    return { direct: { deviceIdentity: device.identity, endpoint: device.endpoint } };
  }
  if (operation.kind === 'adb') {
    const device = await resolveAndroidDevice(config, paths, executeCommand);
    return { args: ['-s', device.endpoint, ...operation.args], command: config.adbPath, deviceIdentity: device.identity };
  }
  const readRoot = scopedRoot(request.cwd.scope, paths, evidenceRoot);
  const file = resolveWithin(readRoot, path.join(request.cwd.path || '', operation.path));
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > OUTPUT_LIMIT) throw codedError('request_read_rejected', 'requested file must be a bounded regular file');
  return { direct: { content: fs.readFileSync(file, 'utf8'), relativePath: operation.path } };
}

function auditBase(request, commands, startedAt) {
  return {
    commands, commitSha: request.commitSha, cwd: request.cwd, environmentKeys: ENV_KEYS,
    mode: request.mode, operationKind: request.operation.kind,
    requestId: request.requestId, requestSha256: request.requestSha256, schemaVersion: 1,
    startedAt, target: request.target
  };
}

export async function runAndroidLabOperation({ config, executeCommand, paths, request }) {
  const evidenceRoot = path.join(paths.evidence, request.runId);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const cwd = resolveWithin(scopedRoot(request.cwd.scope, paths, evidenceRoot), request.cwd.path || '');
  const startedAt = new Date().toISOString();
  const commands = [];
  let spec = {};
  const auditedExecute = async (command, args, options = {}) => {
    const commandStartedAt = new Date().toISOString();
    try {
      const result = await executeCommand(command, args, options);
      commands.push({ args: auditedArgs(args), command, completedAt: new Date().toISOString(), cwd: options.cwd || null,
        exitCode: result.code ?? null, startedAt: commandStartedAt });
      return result;
    } catch (error) {
      commands.push({ args: auditedArgs(args), command, completedAt: new Date().toISOString(), cwd: options.cwd || null,
        errorCode: error.code || 'command_failed', exitCode: null, startedAt: commandStartedAt });
      throw error;
    }
  };
  try {
    spec = await resolveProcessSpec(config, paths, request, evidenceRoot, auditedExecute);
    const result = spec.direct || await auditedExecute(spec.command, spec.args, {
      cwd: spec.cwd || cwd, env: operationEnvironment(config, paths, evidenceRoot, spec),
      timeoutCode: 'request_timeout', timeoutMs: request.timeoutMs
    });
    const stdout = boundedText(spec.direct ? JSON.stringify(result) : result.stdout ?? result.output);
    const stderr = boundedText(spec.direct ? '' : result.stderr);
    fs.writeFileSync(path.join(evidenceRoot, 'stdout.txt'), stdout, 'utf8');
    fs.writeFileSync(path.join(evidenceRoot, 'stderr.txt'), stderr, 'utf8');
    const code = spec.direct ? 0 : result.code;
    if (code !== 0) {
      const error = codedError('request_command_failed', result.lines?.at(-1) || `${spec.command} exited ${code}`);
      error.exitCode = code;
      throw error;
    }
    writeJsonAtomic(path.join(evidenceRoot, 'command-audit.json'), {
      ...auditBase(request, commands, startedAt), completedAt: new Date().toISOString(), exitCode: code,
      resultStatus: 'success', terminationReason: 'completed'
    });
    writeJsonAtomic(path.join(evidenceRoot, 'summary.json'), {
      commitSha: request.commitSha, operationKind: request.operation.kind, requestId: request.requestId,
      resultStatus: 'success', runId: request.runId, schemaVersion: 1, target: request.target
    });
    return result;
  } catch (error) {
    const stdoutPath = path.join(evidenceRoot, 'stdout.txt');
    const stderrPath = path.join(evidenceRoot, 'stderr.txt');
    if (!fs.existsSync(stdoutPath)) fs.writeFileSync(stdoutPath, boundedText(error.stdout), 'utf8');
    if (!fs.existsSync(stderrPath)) fs.writeFileSync(stderrPath, boundedText(error.stderr), 'utf8');
    writeJsonAtomic(path.join(evidenceRoot, 'command-audit.json'), {
      ...auditBase(request, commands, startedAt), completedAt: new Date().toISOString(), errorCode: error.code || 'request_failed',
      errorMessage: error.message, exitCode: error.exitCode ?? null, resultStatus: 'failure',
      terminationReason: error.code === 'request_timeout' ? 'timeout' : error.exitCode ? 'nonzero_exit' : 'error'
    });
    writeJsonAtomic(path.join(evidenceRoot, 'summary.json'), {
      commitSha: request.commitSha, errorCode: error.code || 'request_failed', operationKind: request.operation.kind,
      requestId: request.requestId, resultStatus: 'failure', runId: request.runId, schemaVersion: 1, target: request.target
    });
    throw error;
  }
}

export async function finishAndroidLabOperationRun({ config, executeCommand, paths, request, running }) {
  const needsCheckout = request.operation.kind !== 'windowsClient' &&
    (request.operation.kind === 'repository' || request.cwd.scope === 'checkout');
  let primaryError = null;
  try {
    if (needsCheckout) {
      writeJsonAtomic(paths.status, { ...running, phase: 'checkout' });
      await prepareAndroidLabCheckout(config, paths, request.commitSha, executeCommand);
    }
    writeJsonAtomic(paths.status, { ...running, phase: 'request_execute' });
    await runAndroidLabOperation({ config, executeCommand, paths, request });
  } catch (error) {
    primaryError = error;
  }
  if (needsCheckout) {
    try { await cleanupAndroidLabCheckout(config, paths, executeCommand); } catch (error) { primaryError ||= error; }
  }
  const completed = {
    ...running, completedAt: new Date().toISOString(), errorCode: primaryError?.code,
    errorMessage: primaryError?.message?.slice(0, 500), phase: 'completed',
    resultStatus: primaryError ? 'failure' : 'success', state: 'completed'
  };
  writeJsonAtomic(paths.status, completed);
  const active = readJson(paths.active);
  if (active?.runId === request.runId) fs.rmSync(paths.active, { force: true });
  if (primaryError) throw primaryError;
  return completed;
}
