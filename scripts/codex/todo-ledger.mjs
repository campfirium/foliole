import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const TODO_PATH = path.join(REPO_ROOT, '.lab', 'agent', 'todo.md');
const VERIFY_PATH = path.join(REPO_ROOT, '.lab', 'agent', 'verify.md');
const OPTIONAL_PATH = path.join(REPO_ROOT, '.lab', 'agent', 'optional.md');
const NOTES_PATH = path.join(REPO_ROOT, '.lab', 'agent', 'notes.md');
const DONE_PATH = path.join(REPO_ROOT, '.lab', 'agent', 'done.md');

const DEFAULT_PAUSE_PATTERNS = [
  /^执行 Windows 客户端集成验收/,
  /^验收 Phase \d+ 退出标志/
];
const TASK_MODE_PREFIX = /^\[(auto|gate)\]\s*/i;
const BRACKET_PREFIX = /^\[[^\]]+\]\s*/;
const CANONICAL_TASK_PATTERN = /^- \[ \] (.+)$/;
const LEGACY_TASK_PATTERN = /^- \[(auto|gate)\]\s+(.+)$/i;

function inferTaskMode(task, patterns = DEFAULT_PAUSE_PATTERNS) {
  return isPauseTask(task, patterns) ? 'gate' : 'auto';
}

export function normalizeTodoLine(line) {
  const legacyMatch = line.match(LEGACY_TASK_PATTERN);
  if (!legacyMatch) {
    return line;
  }
  const [, mode, task] = legacyMatch;
  return `- [ ] [${mode.toLowerCase()}] ${task.trim()}`;
}

export function normalizeTodoMarkdown(markdown) {
  return markdown
    .split('\n')
    .map((line) => normalizeTodoLine(line))
    .join('\n');
}

function parsePendingTask(line, patterns = DEFAULT_PAUSE_PATTERNS) {
  const match = normalizeTodoLine(line.trim()).match(CANONICAL_TASK_PATTERN);
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

export function validateTodoEntries(markdown, fileLabel = 'todo') {
  const lines = normalizeTodoMarkdown(markdown).split('\n');
  const issues = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- [ ] ')) {
      return;
    }
    const match = trimmed.match(CANONICAL_TASK_PATTERN);
    if (!match) {
      return;
    }
    const body = match[1].trim();
    if (!TASK_MODE_PREFIX.test(body)) {
      issues.push(`line ${index + 1}: ${fileLabel} entry must start with [auto] or [gate]`);
      return;
    }
    const taskText = body.replace(TASK_MODE_PREFIX, '').trim();
    if (!taskText) {
      issues.push(`line ${index + 1}: ${fileLabel} task text is empty`);
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
    throw new Error(`invalid todo entries:\n${issues.join('\n')}`);
  }
}

async function readNormalizedLedger(filePath, fileLabel) {
  const originalMarkdown = await readFile(filePath, 'utf8');
  const normalizedMarkdown = normalizeTodoMarkdown(originalMarkdown);
  const issues = validateTodoEntries(normalizedMarkdown, fileLabel);
  if (issues.length > 0) {
    throw new Error(`invalid ${fileLabel} entries:\n${issues.join('\n')}`);
  }
  if (normalizedMarkdown !== originalMarkdown) {
    await writeFile(filePath, normalizedMarkdown, 'utf8');
  }
  return normalizedMarkdown;
}

export function parseTodoEntries(markdown, sectionName = '待办', patterns = DEFAULT_PAUSE_PATTERNS) {
  return normalizeTodoMarkdown(markdown)
    .split('\n')
    .map((line) => parsePendingTask(line.trim(), patterns))
    .filter(Boolean)
    .map((entry) => ({ ...entry, section: sectionName }));
}

export function parseFirstTodoTask(markdown) {
  assertValidTodoEntries(markdown);
  return parseTodoEntries(markdown)[0]?.task ?? '';
}

export function selectNextTodoTask(markdown, sectionName = '待办') {
  return parseTodoEntries(markdown, sectionName)[0] ?? null;
}

export function selectNextExecutableTodoTask(pendingMarkdown, optionalMarkdown = '') {
  const mainlineEntry = selectNextTodoTask(pendingMarkdown, '待办');
  const optionalAutoEntry = parseTodoEntries(optionalMarkdown, '可选').find((entry) => entry.mode === 'auto') ?? null;

  if (!mainlineEntry) {
    return optionalAutoEntry;
  }
  if (!isGateEntry(mainlineEntry)) {
    return mainlineEntry;
  }
  return optionalAutoEntry ?? mainlineEntry;
}

export function isPauseTask(task, patterns = DEFAULT_PAUSE_PATTERNS) {
  return patterns.some((pattern) => pattern.test(task));
}

export function isGateEntry(entry) {
  return entry?.mode === 'gate';
}

export async function readTodoEntry() {
  const [pendingContent, optionalContent] = await Promise.all([
    readNormalizedLedger(TODO_PATH, 'todo'),
    readNormalizedLedger(OPTIONAL_PATH, 'optional')
  ]);
  return selectNextExecutableTodoTask(pendingContent, optionalContent);
}

export async function readPrimaryTodoEntry() {
  const content = await readNormalizedLedger(TODO_PATH, 'todo');
  return selectNextTodoTask(content);
}

export async function readTodoTask() {
  return (await readTodoEntry())?.task ?? '';
}

function removeFirstPendingTask(markdown, task) {
  const lines = markdown.split('\n');
  let removed = false;
  const updatedLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (removed) {
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

export { DEFAULT_PAUSE_PATTERNS, DONE_PATH, NOTES_PATH, OPTIONAL_PATH, REPO_ROOT, TODO_PATH, VERIFY_PATH };
