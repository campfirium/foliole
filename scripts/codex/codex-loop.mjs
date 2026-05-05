import process from 'node:process';

import { runCodexTask } from './codex-task.mjs';
import { buildCommitMessage, commitTrackedChanges, ensureCleanWorkingTree, runCommand } from './git-state.mjs';
import { REPO_ROOT, completePauseTask, isPauseTask, readTodoTask } from './todo-ledger.mjs';

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

async function resolveGate(options) {
  const firstTask = await readTodoTask();
  if (!options.completeGate) {
    return firstTask;
  }
  if (!firstTask || !isPauseTask(firstTask)) {
    throw new Error('complete-gate requires the first pending TODO item to be a pause task');
  }
  await completePauseTask(firstTask);
  process.stdout.write(`[codex-loop] completed gate task: ${firstTask}\n`);
  return readTodoTask();
}

async function runLoop(options) {
  await ensureCleanWorkingTree(REPO_ROOT);
  let task = await resolveGate(options);

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    if (!task) {
      process.stdout.write('[codex-loop] no pending TODO item found\n');
      return 0;
    }
    if (isPauseTask(task)) {
      process.stdout.write(`[codex-loop] waiting-for-acceptance: ${task}\n`);
      return 20;
    }
    if (options.dryRun) {
      process.stdout.write(`[codex-loop] dry-run next task: ${task}\n`);
      return 0;
    }

    process.stdout.write(`[codex-loop] iteration ${iteration}: ${task}\n`);
    await runCodexTask({ fullAuto: true, model: options.model, task });
    await runQualityGate();
    const committed = await commitTrackedChanges(REPO_ROOT, buildCommitMessage(task));
    const nextTask = await readTodoTask();

    if (!committed && nextTask === task) {
      process.stdout.write(`[codex-loop] stalled on task: ${task}\n`);
      return 30;
    }
    task = nextTask;
  }

  process.stdout.write(`[codex-loop] reached max iterations: ${options.maxIterations}\n`);
  return 40;
}

const isMainModule = process.argv[1]?.endsWith('codex-loop.mjs');
if (isMainModule) {
  const exitCode = await runLoop(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

export { parseArgs, runLoop };
