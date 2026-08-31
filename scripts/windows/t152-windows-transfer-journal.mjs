/* global clearTimeout, process, setTimeout */

import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

function stable(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function exactNames(actual, expected, label) {
  if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(expected))) {
    throw new Error(`${label} file set mismatch`);
  }
}

export function validateControlBundleTree({ fileFacts, localRoot }) {
  const expected = ['manifest.json', ...fileFacts.map((item) => item.name)];
  const actual = fs.readdirSync(localRoot);
  exactNames(actual, expected, 'control bundle tree');
  for (const name of actual) {
    const facts = fs.lstatSync(path.join(localRoot, name));
    if (!facts.isFile() || facts.isSymbolicLink()) {
      throw new Error('control bundle entries must be ordinary files');
    }
  }
  return stable(actual);
}

export function validateControlBundleArchive({ archive, directoryName, fileFacts }) {
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8',
    env: { ...process.env, COPYFILE_DISABLE: '1' } }).split(/\r?\n/u).filter(Boolean);
  const expected = [`${directoryName}/`, 'manifest.json', ...fileFacts.map((item) => item.name)]
    .map((name, index) => index === 0 ? name : `${directoryName}/${name}`);
  exactNames(entries, expected, 'control bundle archive');
  return entries;
}

export function createExactControlBundleArchive({ archive, directoryName, fileFacts,
  localParent }) {
  execFileSync('tar', ['-cf', archive, '-C', localParent, directoryName], {
    env: { ...process.env, COPYFILE_DISABLE: '1' } });
  return validateControlBundleArchive({ archive, directoryName, fileFacts });
}

export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
}

export function transferTerminal(command, args, { deadlineAt, env }) {
  return new Promise((resolve) => {
    const started = Date.now(); let stdout = ''; let stderr = ''; let settled = false;
    let timedOut = false;
    const child = spawn(command, args, { detached: true, env, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true;
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
        if (error.code !== 'ESRCH') stderr += `\nprocess-group termination failed: ${error.message}`;
      }
    }, Math.max(0, deadlineAt - Date.now()));
    const finish = (exitCode, signal, error = null) => {
      if (settled) return; settled = true; clearTimeout(timer);
      resolve({ durationMs: Date.now() - started, endedAt: new Date().toISOString(), error,
        exitCode, signal, startedAt: new Date(started).toISOString(), stderr, stdout, timedOut });
    };
    child.on('error', (error) => finish(null, null, error.message));
    child.on('close', (exitCode, signal) => finish(exitCode, signal));
  });
}

export function terminalState(terminal) {
  if (!terminal) return 'not_started';
  return terminal.exitCode === 0 && terminal.signal === null && !terminal.timedOut
    ? 'success' : 'failure';
}

export async function parseControlBundleScripts({ deadlineAt, env, host, parserPath,
  sshBase, verificationToken }) {
  const terminal = await transferTerminal('ssh', ['-T', ...sshBase, host, 'powershell.exe',
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', parserPath,
    '-VerificationBase64', verificationToken], { deadlineAt, env });
  const parsed = JSON.parse(/^T152_SCRIPT_PARSE=(.+)$/mu.exec(terminal.stdout)?.[1] ?? 'null');
  return { parsed, state: terminalState(terminal), terminal };
}

export function validateControlBundleReceipt(receipt, bundle) {
  const envelope = JSON.parse(Buffer.from(bundle.verificationToken, 'base64url').toString('utf8'));
  const expected = bundle.verification;
  if (receipt?.schemaVersion !== 2 || receipt.identity?.bundleId !== expected.bundleId
      || receipt.identity?.bundleSha256 !== expected.bundleSha256
      || receipt.identity?.manifestSha256 !== expected.manifestSha256
      || receipt.identity?.verificationSha256 !== envelope.verificationSha256
      || receipt.identity?.tokenSha256 !== digest(Buffer.from(bundle.verificationToken))) {
    throw new Error('control bundle durable receipt identity mismatch');
  }
  const fullFacts = [receipt.archive, receipt.manifest, receipt.root, receipt.comparison];
  const selfcheckState = receipt.collectionSelfcheck?.state;
  if (selfcheckState === 'failure') {
    const exception = receipt.failure?.exception;
    if (receipt.collectionSelfcheck.caseCount !== 0
        || receipt.collectionSelfcheck.runtimeType !== null
        || fullFacts.some((value) => value !== null)
        || !Array.isArray(receipt.failure?.messages) || !receipt.failure.messages.length
        || !exception?.type || !exception?.message
        || !exception?.scriptName || !Number.isInteger(exception?.scriptLineNumber)
        || !Number.isInteger(exception?.offsetInLine) || !exception?.positionMessage) {
      throw new Error('control bundle early failure receipt is invalid');
    }
    return receipt;
  }
  if (selfcheckState !== 'success'
      || !Number.isInteger(receipt.collectionSelfcheck.caseCount)
      || receipt.collectionSelfcheck.caseCount < 1 || !receipt.collectionSelfcheck.runtimeType
      || fullFacts.some((value) => !value)
      || receipt.archive.sha256 !== expected.bundleSha256
      || receipt.manifest.sha256 !== expected.manifestSha256
      || receipt.root.path !== expected.bundleRoot) {
    throw new Error('control bundle full receipt is invalid');
  }
  return receipt;
}

export async function collectControlBundleReceipt({ bundle, deadlineAt, env, host, localFile,
  sshBase }) {
  const terminal = await transferTerminal('scp', ['-q', ...sshBase,
    `${host}:${bundle.verificationReceiptPath.replaceAll('\\', '/')}`, localFile],
  { deadlineAt, env });
  let parsed = null; let validationError = null;
  if (terminalState(terminal) === 'success') {
    try {
      parsed = validateControlBundleReceipt(JSON.parse(fs.readFileSync(localFile, 'utf8')
        .replace(/^\uFEFF/u, '')), bundle);
    } catch (error) { validationError = error.message; }
  }
  return { parsed, state: parsed ? 'success' : 'failure', terminal, validationError };
}

export async function verifyAndCollectControlBundle({ actionPath, bundle, deadlineAt, env, host,
  localFile, sshBase }) {
  const terminal = await transferTerminal('ssh', ['-T', ...sshBase, host, 'powershell.exe',
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', actionPath,
    '-Action', 'verify-control-bundle', '-VerificationBase64', bundle.verificationToken],
  { deadlineAt, env });
  const receipt = await collectControlBundleReceipt({ bundle, deadlineAt, env, host, localFile,
    sshBase });
  return { receipt, state: terminalState(terminal), terminal };
}

export async function captureSourceFreeHostFacts({ actionLocal, deadlineAt, env, host,
  receiptFile, sshBase }) {
  const remoteName = `t152-host-facts-${randomUUID()}.ps1`;
  const bootstrap = await transferTerminal('scp', ['-q', ...sshBase, actionLocal,
    `${host}:${remoteName}`], { deadlineAt, env });
  const terminal = terminalState(bootstrap) === 'success'
    ? await transferTerminal('ssh', ['-T', ...sshBase, host, 'powershell.exe', '-NoProfile',
      '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', remoteName,
      '-Action', 'host-facts'], { deadlineAt, env }) : null;
  const encoded = /^T152_HOST_FACTS=(.+)$/mu.exec(terminal?.stdout ?? '')?.[1];
  const facts = encoded ? JSON.parse(encoded) : null;
  const receipt = { bootstrap: { state: terminalState(bootstrap), terminal: bootstrap }, facts,
    hostFacts: { state: terminalState(terminal), terminal }, schemaVersion: 1 };
  if (receiptFile) atomicJson(receiptFile, receipt);
  if (!facts || terminalState(terminal) !== 'success') {
    throw Object.assign(new Error('source-free Windows host facts are missing'), { receipt });
  }
  return { facts, receipt };
}

export function createControlBundle({ bundleId, capsuleRoot, files, remoteBaseRoot }) {
  const directoryName = `t152-control-${bundleId}`;
  const localParent = path.join(capsuleRoot, 'control-bundle');
  const localRoot = path.join(localParent, directoryName);
  fs.mkdirSync(localParent, { recursive: true });
  fs.mkdirSync(localRoot, { recursive: false });
  const sourceNames = files.map((file) => path.basename(file));
  if (new Set(sourceNames.map((name) => name.toLowerCase())).size !== sourceNames.length) {
    throw new Error('control bundle source names collide under Windows semantics');
  }
  const fileFacts = files.map((file) => {
    const source = fs.lstatSync(file);
    if (!source.isFile() || source.isSymbolicLink()) {
      throw new Error('control bundle sources must be ordinary files');
    }
    const name = path.basename(file);
    fs.copyFileSync(file, path.join(localRoot, name));
    return { name, sha256: digest(fs.readFileSync(file)) };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const manifest = { bundleId, fileFacts, schemaVersion: 1 };
  const manifestPath = path.join(localRoot, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  validateControlBundleTree({ fileFacts, localRoot });
  const archive = path.join(capsuleRoot, `${directoryName}.tar`);
  const archiveEntries = createExactControlBundleArchive({ archive, directoryName, fileFacts,
    localParent });
  const remoteArchive = path.win32.join(remoteBaseRoot, `${directoryName}.tar`);
  const remoteRoot = path.win32.join(remoteBaseRoot, directoryName);
  const verificationReceiptPath = path.win32.join(remoteBaseRoot,
    `${directoryName}-verification.json`);
  const verification = { archiveEntries, baseRoot: remoteBaseRoot, bundleId,
    bundlePath: remoteArchive, bundleRoot: remoteRoot,
    bundleSha256: digest(fs.readFileSync(archive)),
    manifestSha256: digest(fs.readFileSync(manifestPath)), schemaVersion: 1,
    verificationReceiptPath };
  const verificationJson = JSON.stringify(verification);
  const verificationSha256 = digest(verificationJson);
  const verificationToken = Buffer.from(JSON.stringify({ verificationJson,
    verificationSha256 }), 'utf8').toString('base64url');
  return { archive, archiveEntries, fileFacts, manifest, remoteArchive, remoteRoot,
    verification, verificationJson, verificationReceiptPath, verificationSha256,
    verificationToken };
}

export async function serialTransfers(items, run) {
  const receipts = [];
  for (const item of items) {
    const terminal = await run(item);
    receipts.push({ ...item, sha256: digest(fs.readFileSync(item.local)), terminal,
      terminalState: terminalState(terminal) });
    if (terminalState(terminal) !== 'success') break;
  }
  return receipts;
}
