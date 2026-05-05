import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { runCodexTask } from './codex-task.mjs';
import { buildCommitMessage, commitTrackedChanges, readGitStatus, runCommand } from './git-state.mjs';
import { REPO_ROOT, completePauseTask, isGateEntry, readTodoEntry } from './todo-ledger.mjs';

const REPAIR_ATTEMPT_LIMIT = 2;
const TASK_CONVERSATION_LIMIT = 3;
const SAME_SIGNATURE_LIMIT = 2;
const EXIT_UNRECOVERABLE_FAILURE = 50;
const LOG_DIR = path.join(REPO_ROOT, 'logs', 'codex');

function parseArgs(argv) {
  const options = {
    completeGate: false,
    dryRun: false,
    maxIterations: 20,
    model: process.env.FOLIOLE_CODEX_MODEL ?? ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--complete-gate') {
      options.completeGate = true;
      continue;
    }
    if (value === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (value === '--max-iterations') {
      options.maxIterations = Number.parseInt(argv[index + 1] ?? '', 10);
      index += 1;
      continue;
    }
    if (value === '--model') {
      options.model = argv[index + 1]?.trim() ?? '';
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${value}`);
  }

  if (!Number.isInteger(options.maxIterations) || options.maxIterations <= 0) {
    throw new Error('max iterations must be a positive integer');
  }
  return options;
}

async function runQualityGate() {
  await runCommand('bash', ['scripts/quality-gate-fast.sh'], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  });
}

function normalizeFailureMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function buildFailureSignature(error) {
  const firstLine = normalizeFailureMessage(error)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0];
  return (firstLine ?? 'unknown failure').slice(0, 200);
}

export function buildRepairTask(task, reason) {
  const normalizedTask = task || 'reconcile current workspace';
  return [
    `Repair the current workspace for task: ${normalizedTask}.`,
    'Focus only on the existing uncommitted changes left by the previous loop iteration.',
    'Fix quality-gate failures and keep the task boundary unchanged.',
    `Failure context: ${reason}`
  ].join(' ');
}

function buildNextRoundTask(task, reason) {
  const normalizedTask = task || 'reconcile current workspace';
  return [
    `Continue repairing task: ${normalizedTask}.`,
    'The previous conversation exhausted its repair budget.',
    'Work only from the current uncommitted workspace and keep the same task boundary.',
    `Failure context: ${reason}`
  ].join(' ');
}

async function appendLoopFailureRecord(record) {
  await mkdir(LOG_DIR, { recursive: true });
  const outputPath = path.join(LOG_DIR, 'loop-failures.ndjson');
  await appendFile(outputPath, `${JSON.stringify(record)}\n`, 'utf8');
}

async function stabilizeWorkspace(task, options, dependencies, reason) {
  let lastError = null;

  for (let attempt = 0; attempt <= REPAIR_ATTEMPT_LIMIT; attempt += 1) {
    try {
      await dependencies.runQualityGateFn();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === REPAIR_ATTEMPT_LIMIT) {
        break;
      }
      dependencies.stdout.write(
        `[codex-loop] repair-round ${attempt + 1}/${REPAIR_ATTEMPT_LIMIT}: ${reason}\n`
      );
      await dependencies.runCodexTaskFn({
        fullAuto: true,
        model: options.model,
        task: buildRepairTask(task, normalizeFailureMessage(error))
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function recoverFailedTask(task, options, dependencies, error) {
  const status = await dependencies.readGitStatusFn(REPO_ROOT);
  if (!status) {
    throw error;
  }

  dependencies.stdout.write(`[codex-loop] task failed with dirty workspace; attempting repair: ${task}\n`);
  await stabilizeWorkspace(task, options, dependencies, `task failure after ${task}`);
  const committed = await dependencies.commitTrackedChangesFn(
    REPO_ROOT,
    await dependencies.buildCommitMessageFn(task)
  );

  if (committed) {
    dependencies.stdout.write('[codex-loop] repaired failed task workspace and committed changes\n');
  } else {
    dependencies.stdout.write('[codex-loop] repaired failed task workspace but found no committable changes\n');
  }

  return committed;
}

async function recordLoopFailure(task, round, error, dependencies) {
  const failureSignature = buildFailureSignature(error);
  await dependencies.appendLoopFailureRecordFn({
    at: new Date().toISOString(),
    failureSignature,
    round,
    task
  });
  dependencies.stdout.write(
    `[codex-loop] recorded failed round ${round}/${TASK_CONVERSATION_LIMIT}: ${failureSignature}\n`
  );
  return failureSignature;
}

async function executeTaskRound(taskEntry, round, options, dependencies, priorSignature) {
  const task =
    round === 1
      ? taskEntry.task
      : buildNextRoundTask(taskEntry.task, priorSignature ?? `previous round failed for task: ${taskEntry.task}`);
  await dependencies.runCodexTaskFn({ fullAuto: true, model: options.model, task });
  await stabilizeWorkspace(taskEntry.task, options, dependencies, `quality gate after task: ${taskEntry.task}`);
  return dependencies.commitTrackedChangesFn(
    REPO_ROOT,
    await dependencies.buildCommitMessageFn(taskEntry.task)
  );
}

export async function reconcileDirtyWorkspace(task, options, dependencies) {
  const status = await dependencies.readGitStatusFn(REPO_ROOT);
  if (!status) {
    return false;
  }

  dependencies.stdout.write('[codex-loop] dirty workspace detected; attempting reconcile\n');
  await stabilizeWorkspace(task, options, dependencies, 'startup dirty workspace');
  const committed = await dependencies.commitTrackedChangesFn(
    REPO_ROOT,
    await dependencies.buildCommitMessageFn('reconcile dirty workspace')
  );
  if (committed) {
    dependencies.stdout.write('[codex-loop] reconciled dirty workspace and committed changes\n');
  } else {
    dependencies.stdout.write('[codex-loop] dirty workspace had no committable changes after reconcile\n');
  }
  return true;
}

async function resolveGate(options, dependencies) {
  const firstEntry = await dependencies.readTodoEntryFn();
  if (!options.completeGate) {
    return firstEntry;
  }
  if (!dependencies.isGateEntryFn(firstEntry)) {
    throw new Error('complete-gate requires the first pending TODO item to be a pause task');
  }
  await dependencies.completePauseTaskFn(firstEntry.task);
  dependencies.stdout.write(`[codex-loop] completed gate task: ${firstEntry.task}\n`);
  return dependencies.readTodoEntryFn();
}

async function runLoop(options, overrides = {}) {
  const dependencies = {
    appendLoopFailureRecordFn: appendLoopFailureRecord,
    buildCommitMessageFn: (task) => buildCommitMessage(REPO_ROOT, task),
    commitTrackedChangesFn: commitTrackedChanges,
    completePauseTaskFn: completePauseTask,
    isGateEntryFn: isGateEntry,
    readGitStatusFn: readGitStatus,
    readTodoEntryFn: readTodoEntry,
    runCodexTaskFn: runCodexTask,
    runQualityGateFn: runQualityGate,
    stdout: process.stdout,
    ...overrides
  };
  const pendingEntry = await dependencies.readTodoEntryFn();
  await reconcileDirtyWorkspace(pendingEntry?.task ?? '', options, dependencies);
  let taskEntry = await resolveGate(options, dependencies);

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    if (!taskEntry) {
      dependencies.stdout.write('[codex-loop] no pending TODO item found\n');
      return 0;
    }
    if (dependencies.isGateEntryFn(taskEntry)) {
      dependencies.stdout.write(`[codex-loop] waiting-for-gate: ${taskEntry.task}\n`);
      return 20;
    }
    if (options.dryRun) {
      dependencies.stdout.write(`[codex-loop] dry-run next task: ${taskEntry.task}\n`);
      return 0;
    }

    let committed = false;
    let lastSignature = '';
    let repeatedSignatureCount = 0;

    for (let round = 1; round <= TASK_CONVERSATION_LIMIT; round += 1) {
      dependencies.stdout.write(
        `[codex-loop] iteration ${iteration}, round ${round}/${TASK_CONVERSATION_LIMIT}: ${taskEntry.task}\n`
      );
      try {
        committed = await executeTaskRound(taskEntry, round, options, dependencies, lastSignature);
        break;
      } catch (error) {
        try {
          committed = await recoverFailedTask(taskEntry.task, options, dependencies, error);
          break;
        } catch (recoveryError) {
          const signature = await recordLoopFailure(taskEntry.task, round, recoveryError, dependencies);
          repeatedSignatureCount = signature === lastSignature ? repeatedSignatureCount + 1 : 1;
          lastSignature = signature;
          if (repeatedSignatureCount >= SAME_SIGNATURE_LIMIT || round === TASK_CONVERSATION_LIMIT) {
            throw recoveryError;
          }
          dependencies.stdout.write(
            `[codex-loop] reopening task in a fresh round after failure: ${signature}\n`
          );
        }
      }
    }

    const nextTaskEntry = await dependencies.readTodoEntryFn();

    if (!committed && nextTaskEntry?.task === taskEntry.task) {
      dependencies.stdout.write(`[codex-loop] stalled on task: ${taskEntry.task}\n`);
      return 30;
    }
    taskEntry = nextTaskEntry;
  }

  dependencies.stdout.write(`[codex-loop] reached max iterations: ${options.maxIterations}\n`);
  return 40;
}

const isMainModule = process.argv[1]?.endsWith('codex-loop.mjs');
if (isMainModule) {
  const exitCode = await runLoop(parseArgs(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`[codex-loop] stopped: ${normalizeFailureMessage(error)}\n`);
    return EXIT_UNRECOVERABLE_FAILURE;
  });
  process.exit(exitCode);
}

export { parseArgs, runLoop };
