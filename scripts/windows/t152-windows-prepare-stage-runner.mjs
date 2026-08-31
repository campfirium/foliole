#!/usr/bin/env node
/* global clearTimeout, process, setTimeout */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { decodeT152WindowsPrepareRequest } from './t152-windows-prepare-request.mjs';
import { createNpmLauncherDescriptor, createPrepareContractProjection, createPrepareStagePlan,
  createPrepareStageReceipt, PREPARE_DEADLINE_MS, PREPARE_STAGES, prepareStagePlanSha256 } from
  './t152-windows-prepare-stage-contract.mjs';

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
}

function fileFacts(root, name, evidenceRoot) {
  const files = [];
  const visit = (current) => fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else if (entry.isFile()) files.push(path.relative(root, absolute).replaceAll('\\', '/'));
  });
  visit(root); files.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const list = `${files.join('\n')}\n`;
  fs.writeFileSync(path.join(evidenceRoot, `${name}-files.txt`), list);
  return { count: files.length, sha256: digest(list) };
}

function terminal(spec, deadlineAt, evidenceRoot) {
  return new Promise((resolve) => {
    let stdout = ''; let stderr = ''; let timedOut = false;
    let settled = false; let terminationError = null;
    const child = spawn(spec.file, spec.args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGTERM'); }
      catch (error) { terminationError = error.message; } }, Math.max(0,
      Date.parse(deadlineAt) - Date.now()));
    const finish = (exitCode, signal, error = null) => {
      if (settled) return; settled = true;
      clearTimeout(timer);
      const log = path.join(evidenceRoot, `${spec.name}.log`);
      fs.writeFileSync(log, `${stdout}${stderr}`);
      resolve({ facts: { exit: exitCode, log, logSha256: digest(fs.readFileSync(log)) },
        outcome: { error: error ?? terminationError, exitCode, signal, timedOut } });
    };
    child.on('error', (error) => finish(null, null, error.message));
    child.on('close', (exitCode, signal) => finish(exitCode, signal));
  });
}

function fileIdentity(file) {
  return { path: fs.realpathSync(file), sha256: digest(fs.readFileSync(file)) };
}

function launcherTerminal(spec) {
  return new Promise((resolve) => {
    let stdout = ''; let stderr = ''; let settled = false; let timedOut = false;
    const child = spawn(spec.file, spec.args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 60_000);
    const finish = (exitCode, signal, error = null) => {
      if (settled) return; settled = true; clearTimeout(timer);
      resolve({ error, exitCode, signal, stderr, stdout, timedOut });
    };
    child.on('error', (error) => finish(null, null, error.message));
    child.on('close', (exitCode, signal) => finish(exitCode, signal));
  });
}

async function runLauncherPreflight(request) {
  const descriptor = createNpmLauncherDescriptor(request, 'npm-version', ['--version']);
  const result = await launcherTerminal(descriptor);
  const version = result.exitCode === 0 && result.signal === null && !result.timedOut
    ? result.stdout.trim() : null;
  const receipt = { descriptor, fileIdentities: {
    nodePath: fileIdentity(request.nodePath), npmCliPath: fileIdentity(request.npmCliPath),
    npmCommandPath: fileIdentity(request.npmCommandPath),
    npmManifestPath: fileIdentity(request.npmRuntimeOwner.npmManifestPath) },
  npmRuntimeOwnerSha256: request.npmRuntimeOwner.ownerSha256, rawExit: result.exitCode,
  rawSignal: result.signal, stderr: result.stderr, stdout: result.stdout,
  timedOut: result.timedOut, version };
  process.stdout.write(`T152_NPM_LAUNCHER=${JSON.stringify(receipt)}\n`);
  if (!version || result.error) throw new Error(result.error ?? 'npm launcher preflight failed');
}

function readManifest(request) {
  const value = JSON.parse(fs.readFileSync(request.manifestPath, 'utf8'));
  if (!Object.entries(request.identity).every(([key, item]) => value.identity?.[key] === item)) {
    throw new Error('prepare manifest identity mismatch');
  }
  return value;
}

async function runCommands(request, entry, deadlineAt) {
  const facts = [];
  for (const spec of entry.commands) {
    const result = await terminal(spec, deadlineAt, request.evidenceRoot);
    facts.push(result.facts);
    if (result.outcome.exitCode !== 0 || result.outcome.signal || result.outcome.timedOut) {
      throw Object.assign(new Error(`${spec.name} failed`), result.outcome);
    }
  }
  return facts;
}

async function materialize(request, entry, deadlineAt) {
  if (fs.existsSync(request.capsuleRoot)) throw new Error('capsule already exists');
  fs.mkdirSync(request.sourceRoot, { recursive: true });
  fs.mkdirSync(request.controllerRoot, { recursive: true });
  fs.mkdirSync(request.evidenceRoot, { recursive: true });
  const value = readManifest(request);
  if (digest(fs.readFileSync(request.productArchivePath)) !== value.archiveSha256
      || digest(fs.readFileSync(request.controllerArchivePath)) !== value.controllerArchiveSha256) {
    throw new Error('prepare archive digest mismatch');
  }
  const extract = await runCommands(request, entry, deadlineAt);
  const productFiles = fileFacts(request.sourceRoot, 'product', request.evidenceRoot);
  const controllerFiles = fileFacts(request.controllerRoot, 'controller', request.evidenceRoot);
  if (productFiles.count !== value.productFiles.fileCount
      || productFiles.sha256 !== value.productFiles.fileListSha256
      || controllerFiles.count !== value.controllerFiles.fileCount
      || controllerFiles.sha256 !== value.controllerFiles.fileListSha256
      || digest(fs.readFileSync(path.join(request.sourceRoot, 'package-lock.json')))
        !== value.lockfileSha256) throw new Error('prepare archive content mismatch');
  return { controllerFiles, extract, productFiles };
}

async function commandStage(request, entry, deadlineAt) {
  const facts = await runCommands(request, entry, deadlineAt);
  if (entry.stage === 'finalize') return { controllerRoot: request.controllerRoot,
    sourceRoot: request.sourceRoot, terminal: true };
  if (entry.stage === 'native') return { probe: facts[1], rebuild: facts[0] };
  return facts[0];
}

function predecessor(request, stage, planSha256) {
  const index = PREPARE_STAGES.indexOf(stage);
  if (index === 0) return { deadlineAt: new Date(Date.now() + PREPARE_DEADLINE_MS).toISOString(),
    sha256: null };
  const previousStage = PREPARE_STAGES[index - 1];
  const file = path.join(request.evidenceRoot, `prepare-${previousStage}-receipt.json`);
  if (!fs.existsSync(file)) throw new Error('prepare predecessor is missing');
  const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
  if (value.resultStatus !== 'success' || value.stage !== previousStage
      || value.planSha256 !== planSha256 || !value.deadlineAt) {
    throw new Error('prepare predecessor is invalid');
  }
  return { deadlineAt: value.deadlineAt, sha256: digest(fs.readFileSync(file)) };
}

async function runStage(action, decoded, token) {
  const stage = action.slice('prepare-'.length);
  if (!PREPARE_STAGES.includes(stage)) throw new Error('prepare stage is invalid');
  const { request, requestSha256 } = decoded;
  const plan = createPrepareStagePlan(request); const planSha256 = prepareStagePlanSha256(plan);
  const entry = plan.entries.find((item) => item.stage === stage);
  const receiptPath = path.join(request.evidenceRoot, `prepare-${stage}-receipt.json`);
  if (fs.existsSync(receiptPath)) throw new Error('prepare stage receipt already exists');
  const prior = predecessor(request, stage, planSha256); const startedAt = new Date().toISOString();
  let facts = null; let failure = null;
  let outcome = { error: null, exitCode: 0, signal: null, timedOut: false };
  try { facts = stage === 'materialize' ? await materialize(request, entry, prior.deadlineAt)
    : await commandStage(request, entry, prior.deadlineAt); }
  catch (error) { failure = error.message; outcome = { error: error.message,
    exitCode: error.exitCode ?? null, signal: error.signal ?? null,
    timedOut: error.timedOut ?? false }; }
  const receipt = createPrepareStageReceipt({ deadlineAt: prior.deadlineAt,
    endedAt: new Date().toISOString(), facts, failure, outcome, planSha256,
    predecessorReceiptSha256: prior.sha256, request, requestSha256, stage,
    startedAt, tokenSha256: digest(token) });
  atomicJson(receiptPath, receipt);
  process.stdout.write(`T152_PREPARE_STAGE=${JSON.stringify(receipt)}\n`);
  if (receipt.resultStatus !== 'success') throw new Error(receipt.failure);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) values[argv[index]] = argv[index + 1];
  if (!values['--action']) throw new Error('runner args missing');
  return values;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const decoded = decodeT152WindowsPrepareRequest(args['--request-base64']);
  if (args['--action'] === 'launcher-preflight') {
    await runLauncherPreflight(decoded.request);
  } else if (args['--action'] === 'stage-plan-preflight') {
    const projection = createPrepareContractProjection(decoded.request, decoded.requestSha256,
      digest(args['--request-base64']));
    process.stdout.write(`T152_STAGE_PLAN=${JSON.stringify(projection)}\n`);
  } else await runStage(args['--action'], decoded, args['--request-base64']);
} catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 74; }
