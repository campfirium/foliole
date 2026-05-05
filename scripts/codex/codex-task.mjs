import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT, TODO_PATH, parseFirstTodoTask } from './todo-ledger.mjs';

const LOG_DIR = path.join(REPO_ROOT, 'logs', 'codex');
const DEFAULT_CODEX_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const CODEX_TASK_TIMEOUT_KILL_GRACE_MS = 5_000;
const TASK_SKILL_DIRECTIVE = /^\[skills?:\s*([^\]]+)\]\s*/i;
const EXPLICIT_SKILL_RULES = [
  { skill: 'build-sync', patterns: [/执行构建并同步指令/, /build and sync/i] },
  { skill: 'sync-only', patterns: [/执行同步指令/, /sync only/i] },
  { skill: 'commit-note', patterns: [/执行提交指令/, /(?:^|\s)(?:提交|commit)(?:$|\s)/i] },
  { skill: 'session-handoff', patterns: [/^(继续|continue)$/i, /(?:handoff|交接|继续到下次|continue later)/i] },
  { skill: 'impl-task', patterns: [/执行实施任务指令/] },
  { skill: 'merge-sop', patterns: [/执行合并分支指令/] },
  { skill: 'obsidian-release', patterns: [/执行发布指令/] },
  { skill: 'web-design-guidelines', patterns: [/执行设计指南指令/] }
];

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

export function parseTaskRequest(rawTask) {
  const normalizedTask = rawTask.trim();
  const directiveMatch = normalizedTask.match(TASK_SKILL_DIRECTIVE);
  const directiveSkills = directiveMatch
    ? directiveMatch[1]
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean)
    : [];
  const task = directiveMatch ? normalizedTask.slice(directiveMatch[0].length).trim() : normalizedTask;
  const matchedSkills = EXPLICIT_SKILL_RULES.flatMap(({ skill, patterns }) =>
    patterns.some((pattern) => pattern.test(task)) ? [skill] : []
  );
  const skills = [...new Set([...directiveSkills, ...matchedSkills])];

  return { skills, task };
}

export function buildPrompt(task) {
  const request = parseTaskRequest(task);
  const promptLines = [
    `Work in repository: ${REPO_ROOT}`,
    'Read AGENTS.md first and follow the repo workflow in .lab/agent/workflow.md.',
    `Implement exactly one minimal acceptable task: ${request.task}`,
    'Constraints:',
    '- Stay within the task boundary and avoid unrelated refactors.',
    '- Run minimal relevant verification before finishing.',
    '- Update .lab task ledger only if the task state changes.',
    '- Report summary, verification, root cause if applicable, and remaining risk.'
  ];

  if (request.skills.length > 0) {
    promptLines.splice(
      2,
      0,
      'Explicit skill triggers for this task:',
      ...request.skills.map((skill) => `- Use skill: ${skill}`)
    );
  }

  return promptLines.join('\n');
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
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (didTimeout) {
        reject(createCodexTaskTimeoutError(task, timeoutMs));
        return;
      }
      if (code === 0) {
        resolve(undefined);
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
