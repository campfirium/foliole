import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const TODO_PATH = path.join(REPO_ROOT, '.lab', 'agent', 'TODO.md');
const DONE_PATH = path.join(REPO_ROOT, '.lab', 'agent', 'DONE.md');

const DEFAULT_PAUSE_PATTERNS = [
  /^执行 Windows 客户端集成验收/,
  /^验收 Phase \d+ 退出标志/
];

const TASK_MODE_PREFIX = /^\[(auto|gate)\]\s*/i;
const BRACKET_PREFIX = /^\[[^\]]+\]\s*/;

function inferTaskMode(task, patterns = DEFAULT_PAUSE_PATTERNS) {
  return isPauseTask(task, patterns) ? 'gate' : 'auto';
}

function parsePendingTask(line, patterns = DEFAULT_PAUSE_PATTERNS) {
  const match = line.trim().match(/^- \[ \] (.+)$/);
  if (!match) {
    return null;
  }
  const body = match[1].trim();
  const modeMatch = body.match(TASK_MODE_PREFIX);
  if (modeMatch) {
    return {
      raw: body,
      task: body.slice(modeMatch[0].length).trim(),
      mode: modeMatch[1].toLowerCase()
    };
  }
  return {
    raw: body,
    task: body,
    mode: inferTaskMode(body, patterns)
  };
}

export function validateTodoEntries(markdown) {
  const lines = markdown.split('\n');
  let insideTodoSection = false;
  const issues = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '## 待办') {
      insideTodoSection = true;
      return;
    }
    if (insideTodoSection && trimmed.startsWith('## ')) {
      insideTodoSection = false;
      return;
    }
    if (!insideTodoSection) {
      return;
    }
    const match = trimmed.match(/^- \[ \] (.+)$/);
    if (!match) {
      return;
    }
    const body = match[1].trim();
    if (!TASK_MODE_PREFIX.test(body)) {
      issues.push(`line ${index + 1}: pending TODO must start with [auto] or [gate]`);
      return;
    }
    const taskText = body.replace(TASK_MODE_PREFIX, '').trim();
    if (!taskText) {
      issues.push(`line ${index + 1}: pending TODO task text is empty`);
      return;
    }
    if (BRACKET_PREFIX.test(taskText)) {
      issues.push(`line ${index + 1}: category tags must use plain text like "infra:" instead of extra [label] prefixes`);
    }
  });

  return issues;
}

function assertValidTodoEntries(markdown) {
  const issues = validateTodoEntries(markdown);
  if (issues.length > 0) {
    throw new Error(`invalid TODO.md pending entries:\n${issues.join('\n')}`);
  }
}

export function parseTodoEntries(markdown, patterns = DEFAULT_PAUSE_PATTERNS) {
  const lines = markdown.split('\n');
  let insideTodoSection = false;
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '## 待办') {
      insideTodoSection = true;
      continue;
    }
    if (insideTodoSection && trimmed.startsWith('## ')) {
      break;
    }
    if (!insideTodoSection) {
      continue;
    }
    const entry = parsePendingTask(trimmed, patterns);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

export function parseFirstTodoTask(markdown) {
  assertValidTodoEntries(markdown);
  return parseTodoEntries(markdown)[0]?.task ?? '';
}

export function selectNextTodoTask(markdown) {
  return parseTodoEntries(markdown)[0] ?? null;
}

export function isPauseTask(task, patterns = DEFAULT_PAUSE_PATTERNS) {
  return patterns.some((pattern) => pattern.test(task));
}

export function isGateEntry(entry) {
  return entry?.mode === 'gate';
}

export async function readTodoEntry() {
  const content = await readFile(TODO_PATH, 'utf8');
  assertValidTodoEntries(content);
  return selectNextTodoTask(content);
}

export async function readTodoTask() {
  return (await readTodoEntry())?.task ?? '';
}

function removeFirstPendingTask(markdown, task) {
  const lines = markdown.split('\n');
  let insideTodoSection = false;
  let removed = false;
  const updatedLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed === '## 待办') {
      insideTodoSection = true;
      return true;
    }
    if (insideTodoSection && trimmed.startsWith('## ')) {
      insideTodoSection = false;
      return true;
    }
    if (!insideTodoSection || removed) {
      return true;
    }
    const entry = parsePendingTask(trimmed);
    if (entry?.task === task) {
      removed = true;
      return false;
    }
    return true;
  });

  if (!removed) {
    throw new Error(`pending task not found: ${task}`);
  }
  return updatedLines.join('\n');
}

function appendDoneEntry(markdown, entry) {
  return markdown.endsWith('\n') ? `${markdown}${entry}\n` : `${markdown}\n${entry}\n`;
}

export async function completePauseTask(task, note = 'manual acceptance completed') {
  const [todoContent, doneContent] = await Promise.all([
    readFile(TODO_PATH, 'utf8'),
    readFile(DONE_PATH, 'utf8')
  ]);
  assertValidTodoEntries(todoContent);
  const currentTask = selectNextTodoTask(todoContent);
  if (!currentTask) {
    throw new Error('no pending TODO item found');
  }
  if (currentTask.task !== task) {
    throw new Error(`first pending task mismatch: expected "${task}", got "${currentTask.task}"`);
  }
  if (!isGateEntry(currentTask)) {
    throw new Error(`complete-gate requires a gate task, got "${currentTask.mode}"`);
  }

  const updatedTodo = removeFirstPendingTask(todoContent, task);
  const stamp = new Date().toISOString().slice(0, 10);
  const updatedDone = appendDoneEntry(doneContent, `- [x] ${stamp}: ${task}; ${note}.`);

  await Promise.all([
    writeFile(TODO_PATH, updatedTodo, 'utf8'),
    writeFile(DONE_PATH, updatedDone, 'utf8')
  ]);
}

export { DEFAULT_PAUSE_PATTERNS, DONE_PATH, REPO_ROOT, TODO_PATH };
