/* global process */

import fs from 'node:fs';
import path from 'node:path';

const OWNER_FILE = 'retention-owner.json';
const RECEIPT_FILE = 'formal-run-receipt.json';
const RUN_ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const TASK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;

function readJson(filePath, fsApi) {
  try { return JSON.parse(fsApi.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function isDirectory(pathname, fsApi) {
  try {
    const stats = fsApi.lstatSync(pathname);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch { return false; }
}

function isRegularFile(pathname, fsApi) {
  try {
    const stats = fsApi.lstatSync(pathname);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch { return false; }
}

function within(root, pathname) {
  const relative = path.relative(root, pathname);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function pidMayLive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== 'ESRCH'; }
}

function hasActiveOwner(context, runId, fsApi, checkPid) {
  const ownerPath = path.join(context.controllerStateRoot, 'runs', runId, 'owner.json');
  if (!fsApi.existsSync(ownerPath)) return false;
  const owner = readJson(ownerPath, fsApi);
  return !owner || owner.runId !== runId || checkPid(owner.pid);
}

function expectedEvidencePath(context, actionContract, runId, fsApi) {
  const descriptor = actionContract.formalEvidence;
  if (descriptor?.kind !== 'run-directory') return null;
  const physicalRoot = fsApi.realpathSync(context.artifactsRoot);
  const category = path.join(physicalRoot, descriptor.root);
  const evidence = path.join(category, runId);
  if (!within(physicalRoot, category) || !within(physicalRoot, evidence)) return null;
  if (fsApi.existsSync(category) && !isDirectory(category, fsApi)) return null;
  if (fsApi.existsSync(evidence) && !isDirectory(evidence, fsApi)) return null;
  return evidence;
}

function candidateFor(directory, context, actionContract, taskId, fsApi, checkPid) {
  if (!isDirectory(directory, fsApi)) return null;
  const runId = path.basename(directory);
  if (!RUN_ID_PATTERN.test(runId)) return null;
  const receiptPath = path.join(directory, RECEIPT_FILE);
  const ownerPath = path.join(directory, OWNER_FILE);
  if (!isRegularFile(receiptPath, fsApi) || !isRegularFile(ownerPath, fsApi)) return null;
  const receipt = readJson(receiptPath, fsApi);
  const owner = readJson(ownerPath, fsApi);
  const terminal = ['complete', 'failed'].includes(receipt?.resultStatus);
  const targetMatches = receipt?.target?.kind === actionContract.formalTarget
    && receipt?.target?.identity === actionContract.formalTargetIdentity;
  if (!terminal || typeof receipt.completedAt !== 'string' || receipt.runId !== runId
      || receipt.action !== actionContract.action
      || !targetMatches || owner?.schemaVersion !== 1 || owner.runId !== runId
      || owner.taskId !== taskId || owner.action !== actionContract.action
      || owner.target?.kind !== receipt.target.kind || owner.target?.identity !== receipt.target.identity
      || hasActiveOwner(context, runId, fsApi, checkPid)) return null;
  const evidencePath = expectedEvidencePath(context, actionContract, runId, fsApi);
  if (!evidencePath) return null;
  return { completedAt: receipt.completedAt ?? '', directory, evidencePath,
    evidencePresent: fsApi.existsSync(evidencePath), runId };
}

function matchingCandidates(context, actionContract, taskId, fsApi, checkPid) {
  const root = path.join(context.artifactsRoot, 'macos-a5-formal');
  if (!isDirectory(root, fsApi)) return [];
  return fsApi.readdirSync(root).map((name) => candidateFor(
    path.join(root, name), context, actionContract, taskId, fsApi, checkPid
  )).filter(Boolean);
}

function removeSuperseded(candidate, removeEntry) {
  if (candidate.evidencePresent) removeEntry(candidate.evidencePath);
  removeEntry(candidate.directory);
}

export function formalEvidenceRetentionTaskId(actionContract, {
  env = process.env, formal = false
} = {}) {
  if (!formal || actionContract.formalEvidenceRetention !== 'latest-terminal-per-task') return null;
  const taskId = env.FOLIOLE_ACCEPTANCE_TASK_ID;
  if (!TASK_ID_PATTERN.test(taskId ?? '')) {
    throw new Error('FOLIOLE_ACCEPTANCE_TASK_ID must be 1-64 lowercase letters, digits, or hyphens.');
  }
  return taskId;
}

export function writeFormalEvidenceRetentionOwner(receipt, taskId, fsApi = fs) {
  const owner = { action: receipt.receipt.action, runId: receipt.receipt.runId, schemaVersion: 1,
    target: receipt.receipt.target, taskId };
  fsApi.writeFileSync(path.join(path.dirname(receipt.path), OWNER_FILE),
    `${JSON.stringify(owner, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return owner;
}

export function replaceSupersededFormalEvidence({
  actionContract, checkPid = pidMayLive, context, currentRunId = null, fsApi = fs,
  removeEntry = (pathname) => fsApi.rmSync(pathname, { force: true, recursive: true }), taskId
}) {
  const candidates = matchingCandidates(context, actionContract, taskId, fsApi, checkPid);
  const current = currentRunId ? candidates.find((item) => item.runId === currentRunId) : null;
  const keeper = current?.evidencePresent ? current : (!currentRunId
    ? candidates.filter((item) => item.evidencePresent)
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0]
    : null);
  if (!keeper) return { deletedCount: 0, failures: [] };
  const failures = [];
  let deletedCount = 0;
  for (const candidate of candidates) {
    if (candidate.runId === keeper.runId) continue;
    try { removeSuperseded(candidate, removeEntry); deletedCount += 1; }
    catch (error) { failures.push({ message: error.message, runId: candidate.runId }); }
  }
  return { deletedCount, failures };
}
