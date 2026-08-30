#!/usr/bin/env node
/* global console, process, URL */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createT152DesktopDnsSdLibrary, verifyT152DesktopDnsSdLibrary } from
  '../desktop/t152-desktop-dnssd-library.mjs';
import { createFormalInteractiveRequest } from './t152-windows-formal-interactive-contract.mjs';
import { createBootstrapConfig, waitForScheduledWorker } from
  './t152-windows-formal-interactive-bootstrap.mjs';

function requiredConfig(config) {
  const paths = ['baseRoot', 'capsuleRoot', 'controllerRoot', 'evidenceRoot', 'nodePath',
    'sourceRoot', 'stateRoot'];
  if (!paths.every((key) => path.win32.isAbsolute(config[key] ?? ''))
      || !Array.isArray(config.protectedRoots)) throw new Error('T152 runner paths are invalid.');
  return config;
}

function readOwner(config) {
  const input = { baseRoot: config.baseRoot, evidenceRoot: config.evidenceRoot,
    rootId: config.rootId, sourceRoot: config.sourceRoot };
  if (config.phase === 'g2-path') {
    return createT152DesktopDnsSdLibrary(input, { pathApi: path.win32 });
  }
  const receipt = JSON.parse(fs.readFileSync(config.ownerReceiptPath, 'utf8'));
  return { ...verifyT152DesktopDnsSdLibrary(input, receipt, { pathApi: path.win32 }),
    receiptPath: config.ownerReceiptPath };
}

async function productModules(sourceRoot) {
  const rootUrl = pathToFileURL(path.win32.join(sourceRoot, 'scripts', 'windows'));
  return Promise.all([
    import(new URL('./windows-client-native-interactive-state.mjs', `${rootUrl.href}/`)),
    import(new URL('./windows-client-native-process.mjs', `${rootUrl.href}/`))
  ]);
}

function bootstrapIdentity(config) {
  return { capsuleId: config.capsuleId, controllerCommit: config.controllerCommit,
    controllerTree: config.controllerTree, productCommit: config.productCommit,
    productTree: config.productTree, rootId: config.rootId, t7Run: config.t7Run };
}

async function dispatch(config, request) {
  const [stateModule, processOwner] = await productModules(config.sourceRoot);
  const state = stateModule.interactiveStatePaths(config.stateRoot);
  stateModule.writeJsonAtomic(state.request, request);
  stateModule.writeJsonAtomic(state.status, { nonce: request.nonce, schemaVersion: 2,
    state: 'pending' });
  const install = path.win32.join(config.controllerRoot, 'scripts', 'windows',
    't152-windows-formal-interactive-install.ps1');
  const worker = path.win32.join(config.controllerRoot, 'scripts', 'windows',
    't152-windows-formal-interactive-worker.mjs');
  const bootstrap = path.win32.join(config.controllerRoot, 'scripts', 'windows',
    't152-windows-formal-interactive-bootstrap.mjs');
  const taskDefinition = { bootstrapPath: bootstrap, nodePath: config.nodePath,
    principal: { logonType: 'Interactive', runLevel: 'Limited' }, settings: {
      executionTimeLimit: 'PT3M', multipleInstances: 'IgnoreNew' }, stateRoot: config.stateRoot,
    taskName: stateModule.WINDOWS_NATIVE_CLIENT_TASK, workingDirectory: config.sourceRoot };
  stateModule.writeJsonAtomic(path.win32.join(config.stateRoot, 'bootstrap-config.json'),
    createBootstrapConfig({ bootstrapPath: bootstrap, identity: bootstrapIdentity(config),
      nodePath: config.nodePath, request, stateRoot: config.stateRoot, taskDefinition, workerPath: worker,
      workingDirectory: config.sourceRoot }));
  const installed = await processOwner.runCapture('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', install,
    '-NodePath', config.nodePath, '-WorkDir', config.sourceRoot,
    '-BootstrapScript', bootstrap, '-StateRoot', config.stateRoot
  ], { cwd: config.controllerRoot, timeoutMs: 30_000 });
  if (installed.code !== 0) throw new Error('T152 interactive task installation failed.');
  const launch = await processOwner.runCapture('schtasks.exe', ['/Run', '/TN',
    stateModule.WINDOWS_NATIVE_CLIENT_TASK], { cwd: config.controllerRoot, timeoutMs: 30_000 });
  if (launch.code !== 0) throw new Error('T152 interactive task launch failed.');
  return waitForScheduledWorker(config.stateRoot, request.nonce,
    { resultTimeoutMs: 20 * 60_000, startTimeoutMs: 5_000 });
}

async function main() {
  const configPath = process.argv[2];
  if (!path.win32.isAbsolute(configPath ?? '')) throw new Error('T152 config path is required.');
  const config = requiredConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  if (config.phase === 'g2-path') {
    fs.mkdirSync(config.evidenceRoot, { recursive: true });
    fs.mkdirSync(config.stateRoot, { recursive: true });
  } else if (!fs.existsSync(config.evidenceRoot) || !fs.existsSync(config.stateRoot)) {
    throw new Error('T152 admission roots are missing.');
  }
  const owner = readOwner(config);
  const request = createFormalInteractiveRequest({ ...config,
    ownerHash: owner.ownerHash,
    ownerReceipt: JSON.parse(fs.readFileSync(owner.receiptPath, 'utf8'))
  });
  const result = await dispatch(config, request);
  if (result.exitCode !== 0) throw new Error(result.error || 'T152 interactive worker failed.');
  console.log(`[t152-windows-formal] phase=${config.phase} receipt=${result.receiptPath}`);
}

main().catch((error) => {
  console.error(`[t152-windows-formal] ${error.message}`);
  process.exitCode = 1;
});
