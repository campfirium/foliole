import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

import {
  findOwnedLaunchProcesses,
  readMacProcessTable
} from './playwright-desktop-process-identity.mjs';

const SCHEMA_VERSION = 1;
const REGISTRY_ROOT = path.resolve('.tmp/runtime/desktop-playwright-ownership');
const LAUNCH_ARG_PREFIX = '--foliole-playwright-launch-id=';
const DEFAULT_RUN_TOKEN = randomUUID();

function pathIsInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function writeRecord(record, registryRoot) {
  fs.mkdirSync(registryRoot, { recursive: true });
  const recordPath = path.join(registryRoot, `${record.launchId}.json`);
  const temporaryPath = `${recordPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporaryPath, recordPath);
  return recordPath;
}

export function createDesktopLaunchIdentity(env = process.env) {
  const launchId = randomUUID();
  return {
    launchArg: `${LAUNCH_ARG_PREFIX}${launchId}`,
    launchId,
    runToken: env.FOLIOLE_ELECTRON_PLAYWRIGHT_RUN_TOKEN?.trim() || DEFAULT_RUN_TOKEN
  };
}

export async function registerDesktopOwnership({
  appRoot,
  executable,
  launchIdentity,
  launchMode,
  mainEntry,
  mainPid,
  managerPid = process.pid,
  registryRoot = REGISTRY_ROOT,
  stateRoot
}, { platform = process.platform, readProcessTable = readMacProcessTable } = {}) {
  if (platform !== 'darwin' || launchMode !== 'args' || !executable || !mainEntry) {
    return { managed: false, reason: 'unsupported-launch' };
  }
  if (!pathIsInside(executable, appRoot) || !pathIsInside(mainEntry, appRoot)) {
    return { managed: false, reason: 'external-launch-path' };
  }
  const table = await readProcessTable();
  const main = table.find((entry) => entry.pid === mainPid);
  const manager = table.find((entry) => entry.pid === managerPid);
  if (!main || main.pgid !== main.pid || !main.command.startsWith(path.resolve(executable)) ||
      !main.command.includes(mainEntry) || !main.command.includes(launchIdentity.launchId) ||
      !main.command.includes(stateRoot) || !manager) {
    return { managed: false, reason: 'main-identity-incomplete' };
  }
  const timestamp = new Date().toISOString();
  const record = {
    schemaVersion: SCHEMA_VERSION,
    runToken: launchIdentity.runToken,
    launchId: launchIdentity.launchId,
    managerPid,
    managerStartTime: manager.startTime,
    mainPid,
    mainPgid: main.pgid,
    mainStartTime: main.startTime,
    mainCommand: main.command,
    appRoot: path.resolve(appRoot),
    executable: path.resolve(executable),
    mainEntry: path.resolve(mainEntry),
    launchMode,
    stateRoot: path.resolve(stateRoot),
    createdAt: timestamp,
    updatedAt: timestamp,
    closeState: 'open'
  };
  const recordPath = writeRecord(record, registryRoot);
  return { managed: true, record, recordPath };
}

function signalGroups(entries, signal, kill = process.kill) {
  const groups = [...new Set(entries.map((entry) => entry.pgid).filter((pgid) => pgid > 0))];
  for (const pgid of groups) kill(-pgid, signal);
}

function findDetachedHelpers(processTable, record) {
  return processTable.filter((entry) =>
    entry.startTime >= record.mainStartTime &&
    entry.command.includes(record.launchId) &&
    entry.command.includes(record.stateRoot)
  );
}

export async function closeOwnedDesktopLaunch(ownership, {
  readProcessTable = readMacProcessTable,
  kill = process.kill,
  wait = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
  termWaitMs = 750,
  killWaitMs = 500
} = {}) {
  if (!ownership?.managed) return { confirmedExited: false, reason: ownership?.reason ?? 'unmanaged' };
  const initialTable = await readProcessTable();
  let match = findOwnedLaunchProcesses(initialTable, ownership.record);
  let ownedProcesses = match.accepted;
  if (match.reason) {
    const mainStillExists = initialTable.some((entry) => entry.pid === ownership.record.mainPid);
    if (mainStillExists) return { confirmedExited: false, reason: match.reason };
    ownedProcesses = findDetachedHelpers(initialTable, ownership.record);
    if (!ownedProcesses.length) {
      fs.rmSync(ownership.recordPath, { force: true });
      return { confirmedExited: true, reason: 'already-exited' };
    }
  }
  signalGroups(ownedProcesses, 'SIGTERM', kill);
  await wait(termWaitMs);
  const afterTerm = await readProcessTable();
  match = findOwnedLaunchProcesses(afterTerm, ownership.record);
  const launchSurvivors = findDetachedHelpers(afterTerm, ownership.record);
  if (!match.reason || launchSurvivors.length) {
    signalGroups(match.reason ? launchSurvivors : match.accepted, 'SIGKILL', kill);
    await wait(killWaitMs);
  }
  const remaining = (await readProcessTable()).filter((entry) =>
    entry.command.includes(ownership.record.launchId)
  );
  const confirmedExited = remaining.length === 0;
  if (confirmedExited) fs.rmSync(ownership.recordPath, { force: true });
  return { confirmedExited, reason: confirmedExited ? null : 'owned-processes-remain' };
}

export function completeDesktopOwnership(ownership) {
  if (ownership?.managed) fs.rmSync(ownership.recordPath, { force: true });
}
