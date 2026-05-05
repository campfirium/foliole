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

export function parseFirstTodoTask(markdown) {
  const lines = markdown.split('\n');
  let insideTodoSection = false;

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
    const match = trimmed.match(/^- \[ \] (.+)$/);
    if (match) {
      return match[1].trim();
    }
  }

  return '';
}

export function isPauseTask(task, patterns = DEFAULT_PAUSE_PATTERNS) {
  return patterns.some((pattern) => pattern.test(task));
}

export async function readTodoTask() {
  const content = await readFile(TODO_PATH, 'utf8');
  return parseFirstTodoTask(content);
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
    if (trimmed === `- [ ] ${task}`) {
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
  const firstTask = parseFirstTodoTask(todoContent);
  if (!firstTask) {
    throw new Error('no pending TODO item found');
  }
  if (firstTask !== task) {
    throw new Error(`first pending task mismatch: expected "${task}", got "${firstTask}"`);
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
