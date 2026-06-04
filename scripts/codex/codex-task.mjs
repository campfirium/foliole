import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT, TODO_PATH, parseFirstTodoTask } from './todo-ledger.mjs';
import { assertAgentCompletionMessage } from './codex-task-completion.mjs';
import { buildPrompt, parseTaskRequest } from './codex-task-prompt.mjs';

const LOG_DIR = path.join(REPO_ROOT, 'logs', 'codex');
const DEFAULT_CODEX_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const CODEX_TASK_TIMEOUT_KILL_GRACE_MS = 5_000;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    fullAuto: true,
    model: process.env.FOLIOLE_CODEX_MODEL ?? '',
    task: process.env.FOLIOLE_CODEX_TASK?.trim() ?? '',
    timeoutMs: process.env.FOLIOLE_CODEX_TASK_TIMEOUT_MS ?? ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (value === '--no-full-auto') {
      options.fullAuto = false;
      continue;
    }
    if (value === '--task') {
      options.task = argv[index + 1]?.trim() ?? '';
      index += 1;
      continue;
    }
    if (value === '--model') {
      options.model = argv[index + 1]?.trim() ?? '';
      index += 1;
      continue;
    }
    if (value === '--timeout-ms') {
      options.timeoutMs = argv[index + 1]?.trim() ?? '';
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${value}`);
  }

  return options;
}

function parsePositiveInteger(input) {
  if (typeof input === 'number') {
    return Number.isInteger(input) && input > 0 ? input : null;
  }
  if (typeof input !== 'string') {
    return null;
  }
  const normalized = input.trim();
  if (!/^\d+$/u.test(normalized)) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveCodexTaskTimeoutMs(rawTimeout) {
  return parsePositiveInteger(rawTimeout) ?? DEFAULT_CODEX_TASK_TIMEOUT_MS;
}

function createCodexTaskTimeoutError(task, timeoutMs) {
  const error = new Error(`codex task timeout after ${timeoutMs}ms for task: ${task}`);
  error.code = 'CODEX_TASK_TIMEOUT';
  return error;
}

function terminateChildProcessTree(child, signal) {
  if (!child.pid) {
    return;
  }
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      void error;
    }
  }
  try {
    child.kill(signal);
  } catch (error) {
    void error;
  }
}

async function resolveTask(task) {
  if (task) {
    return task;
  }

  const todoContent = await readFile(TODO_PATH, 'utf8');
  const nextTask = parseFirstTodoTask(todoContent);
  if (!nextTask) {
    throw new Error('no pending TODO item found and no --task provided');
  }
  return nextTask;
}

function createTimestamp() {
  return new Date().toISOString().replace(/[:]/g, '-');
}

async function assertAgentCompletionFile(filePath) {
  try {
    assertAgentCompletionMessage(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

export function buildCodexArgs({ task, model, fullAuto, lastMessageFile }) {
  const args = ['exec', '-', '-C', REPO_ROOT, '-o', lastMessageFile];
  if (fullAuto) {
    args.push('--full-auto');
  }
  if (model) {
    args.push('--model', model);
  }
  args.push('--skip-git-repo-check');
  args.push('--color', 'always');
  return { args, prompt: buildPrompt(task) };
}

async function ensureLogDir() {
  await mkdir(LOG_DIR, { recursive: true });
}

export async function runCodexTask(options) {
  const task = await resolveTask(options.task);
  await ensureLogDir();
  const timeoutMs = resolveCodexTaskTimeoutMs(options.timeoutMs);

  const lastMessageFile = path.join(LOG_DIR, `last-message-${createTimestamp()}.md`);
  const { args, prompt } = buildCodexArgs({
    task,
    model: options.model ?? '',
    fullAuto: options.fullAuto ?? true,
    lastMessageFile
  });

  if (options.dryRun) {
    process.stdout.write(`[codex-task] task: ${task}\n`);
    process.stdout.write(`[codex-task] timeout: ${timeoutMs}ms\n`);
    process.stdout.write(`[codex-task] last message: ${lastMessageFile}\n`);
    process.stdout.write(`[codex-task] command: codex ${args.join(' ')}\n`);
    process.stdout.write('[codex-task] prompt preview:\n');
    process.stdout.write(`${prompt}\n`);
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn('codex', args, {
      cwd: REPO_ROOT,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        PREVIEW_DEDUPE_WAIT_ON_FAILURE: process.env.PREVIEW_DEDUPE_WAIT_ON_FAILURE ?? '0'
      },
      stdio: ['pipe', 'inherit', 'inherit']
    });
    let didTimeout = false;
    const timeout = setTimeout(() => {
      didTimeout = true;
      terminateChildProcessTree(child, 'SIGTERM');
      setTimeout(() => terminateChildProcessTree(child, 'SIGKILL'), CODEX_TASK_TIMEOUT_KILL_GRACE_MS).unref();
    }, timeoutMs);
    timeout.unref();

    child.stdin.write(prompt);
    child.stdin.end();
    child.on('error', reject);
    child.on('exit', async (code) => {
      clearTimeout(timeout);
      if (didTimeout) {
        reject(createCodexTaskTimeoutError(task, timeoutMs));
        return;
      }
      if (code === 0) {
        try {
          await assertAgentCompletionFile(lastMessageFile);
          resolve(undefined);
        } catch (error) {
          reject(error);
        }
        return;
      }
      reject(new Error(`codex exec failed with code ${code ?? 'null'}`));
    });
  });

  process.stdout.write(`[codex-task] saved last agent message to ${lastMessageFile}\n`);
}

async function run() {
  await runCodexTask(parseArgs(process.argv.slice(2)));
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isMainModule) {
  await run();
}

export { DEFAULT_CODEX_TASK_TIMEOUT_MS, resolveCodexTaskTimeoutMs };
export { buildPrompt, parseTaskRequest };
