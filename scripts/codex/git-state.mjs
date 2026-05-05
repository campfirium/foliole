import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const UNTRACKED_STAGE_ALLOWLIST = [
  /^(?:apps|assets|docs|electron|lib|native|packages|public|scripts|src|tests)\//,
  /^(?:AGENTS\.md|README(?:\.[a-z0-9-]+)?\.md|index\.html|package(?:-lock)?\.json)$/i,
  /^[a-z0-9._-]+\.(?:cjs|cmd|cts|css|html|js|json|md|mjs|mts|ps1|sh|toml|ts|tsx|txt|ya?ml)$/i,
  /^(?:eslint|playwright|postcss|prettier|tailwind|tsconfig|vite|vitest)(?:\.[a-z0-9-]+)*\.(?:[cm]?[jt]s|json)$/i
];

const UNTRACKED_STAGE_BLOCKLIST = [
  /^\.lab\//,
  /^\.tmp(?:$|\/|-)/,
  /^\.cache(?:$|\/|-)/,
  /^blob-report(?:$|\/)/,
  /^coverage(?:$|\/)/,
  /^dist(?:$|\/)/,
  /^electron-dist(?:$|\/)/,
  /^logs(?:$|\/)/,
  /^node_modules(?:$|\/)/,
  /^playwright-report(?:$|\/)/,
  /^release(?:$|\/)/,
  /^test-results(?:$|\/)/,
  /(?:^|\/)\.DS_Store$/,
  /(?:^|\/)node-compile-cache(?:$|\/)/,
  /(?:^|\/)[^/]+\.log$/i
];

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    let settled = false;

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectOnce);
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      if (code === 0) {
        settled = true;
        resolve({ stdout, stderr });
        return;
      }
      rejectOnce(new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'null'}\n${stderr}`));
    });
  });
}

export async function readGitStatus(cwd) {
  const result = await runCommand('git', ['status', '--porcelain'], { cwd });
  return result.stdout.trim();
}

export async function ensureCleanWorkingTree(cwd) {
  const status = await readGitStatus(cwd);
  if (status) {
    throw new Error('working tree is not clean; commit or stash changes before running agent loop');
  }
}

function splitIdentifierTokens(value) {
  return value
    .replace(/\.[^.]+$/u, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .match(/[a-z0-9]+/g);
}

function tokenizeTask(task) {
  return task
    .toLowerCase()
    .replace(/[`"]/g, '')
    .match(/[a-z0-9]+/g);
}

const SUBJECT_STOP_WORDS = new Set(['context', 'change', 'intent']);
const GENERIC_FILE_TOKENS = new Set([
  'app',
  'components',
  'component',
  'electron',
  'features',
  'lib',
  'model',
  'scripts',
  'settings',
  'shared',
  'src',
  'store',
  'test',
  'tests',
  'ts',
  'tsx'
]);

function buildCommitTopic(task) {
  const tokens = tokenizeTask(task) ?? [];
  const filteredTokens = tokens.filter((token) => !SUBJECT_STOP_WORDS.has(token));
  const ascii = (filteredTokens.length > 0 ? filteredTokens : tokens).join(' ').trim();

  if (!ascii) {
    return 'agent loop checkpoint';
  }

  return ascii.slice(0, 60).trim();
}

function escapeBodyValue(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateWords(value, limit) {
  const words = escapeBodyValue(value).split(' ').filter(Boolean);
  if (words.length <= limit) {
    return words.join(' ');
  }
  return words.slice(0, limit).join(' ');
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function toEnglishTaskHint(task) {
  const topic = buildCommitTopic(task || '');
  if (!topic || topic === 'agent loop checkpoint') {
    return 'current repository task';
  }
  return topic;
}

function collectPathTokens(file) {
  return file
    .split('/')
    .flatMap((segment) => splitIdentifierTokens(segment) ?? [])
    .filter((token) => token.length > 2 && !GENERIC_FILE_TOKENS.has(token));
}

function buildFileTopic(files) {
  const counts = new Map();
  files.forEach((file) => {
    collectPathTokens(file).forEach((token) => {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([token]) => token)
    .join(' ');
}

function createSubjectFromEvidence(task, files) {
  const taskTopic = buildCommitTopic(task || '');
  if (taskTopic && taskTopic !== 'agent loop checkpoint') {
    return taskTopic;
  }
  const fileTopic = buildFileTopic(files);
  if (fileTopic) {
    return truncateWords(fileTopic, 8);
  }
  return 'agent loop checkpoint';
}

async function listStagedFiles(cwd) {
  const result = await runCommand('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd });
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function readStagedDiffStat(cwd) {
  const result = await runCommand('git', ['diff', '--cached', '--stat=160,120'], { cwd });
  return result.stdout.trim();
}

async function readStagedNumstat(cwd) {
  const result = await runCommand('git', ['diff', '--cached', '--numstat'], { cwd });
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [addedRaw, deletedRaw, file = ''] = line.split('\t');
      return {
        added: /^\d+$/u.test(addedRaw) ? Number.parseInt(addedRaw, 10) : 0,
        deleted: /^\d+$/u.test(deletedRaw) ? Number.parseInt(deletedRaw, 10) : 0,
        file
      };
    });
}

async function collectCommitEvidence(cwd) {
  const files = await listStagedFiles(cwd);
  const numstat = await readStagedNumstat(cwd);
  const diffStat = await readStagedDiffStat(cwd);
  const added = numstat.reduce((sum, entry) => sum + entry.added, 0);
  const deleted = numstat.reduce((sum, entry) => sum + entry.deleted, 0);
  return {
    added,
    deleted,
    diffStat,
    files,
    numstat
  };
}

export function buildCommitNotePrompt({ sequence, task, evidence }) {
  const filesPreview = evidence.files.length > 0 ? evidence.files.map((file) => `- ${file}`).join('\n') : '- none';
  const diffStat = evidence.diffStat || '(no staged diff stat available)';
  return [
    'Read AGENTS.md first and follow the repository commit rules.',
    'Explicit skill triggers for this task:',
    '- Use skill: commit-note',
    'Prepare a commit message for the already staged git changes.',
    'Return only the final commit message block.',
    `Required sequence prefix: ${sequence}`,
    `Task hint: ${toEnglishTaskHint(task)}`,
    'Staged files:',
    filesPreview,
    'Staged diff stat:',
    diffStat
  ].join('\n');
}

function isValidCommitMessage(message, sequence) {
  const normalized = message.trim();
  if (!normalized.startsWith(`${sequence} `)) {
    return false;
  }
  const lines = normalized.split('\n');
  if (lines.length < 5 || lines[1] !== '') {
    return false;
  }
  return (
    lines[2]?.startsWith('context: ') &&
    lines[3]?.startsWith('change: ') &&
    lines[4]?.startsWith('intent: ')
  );
}

function normalizeGeneratedCommitMessage(message) {
  return message
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

async function runCodexPrompt(cwd, prompt) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'foliole-commit-note-'));
  const outputPath = path.join(tempDir, 'last-message.md');

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        'codex',
        ['exec', '-', '-C', cwd, '-o', outputPath, '--skip-git-repo-check', '--color', 'never'],
        { cwd, stdio: ['pipe', 'inherit', 'inherit'] }
      );

      child.stdin.write(prompt);
      child.stdin.end();
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve(undefined);
          return;
        }
        reject(new Error(`codex exec failed with code ${code ?? 'null'}`));
      });
    });

    return (await readFile(outputPath, 'utf8')).trim();
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

export function buildFallbackCommitMessage({ sequence, task, evidence }) {
  const subject = truncateWords(createSubjectFromEvidence(task, evidence.files), 10);
  const touchedFiles = evidence.files.slice(0, 3).join(', ');
  const context = `context: automated loop completed ${toEnglishTaskHint(task)}.`;
  const change = `change: update ${pluralize(evidence.files.length, 'file')} (${touchedFiles || 'no staged files'}) with ${evidence.added} additions and ${evidence.deleted} deletions.`;
  const intent = `intent: keep ${truncateWords(buildFileTopic(evidence.files) || 'the changed area', 6)} aligned with the staged implementation.`;

  return [
    `${sequence} ${subject}`,
    '',
    context,
    change,
    intent
  ].join('\n');
}

export async function getNextCommitSequence(cwd) {
  const result = await runCommand('git', ['log', '--pretty=%s', '-n', '200'], { cwd });
  const subjects = result.stdout.split('\n');
  let maxSequence = 0;

  for (const subject of subjects) {
    const match = subject.match(/^(\d{6})\s/);
    if (!match) {
      continue;
    }
    const value = Number.parseInt(match[1], 10);
    if (Number.isInteger(value) && value > maxSequence) {
      maxSequence = value;
    }
  }

  return String(maxSequence + 1).padStart(6, '0');
}

export async function buildCommitMessage(cwd, task, options = {}) {
  const sequence = await getNextCommitSequence(cwd);
  const evidence = await collectCommitEvidence(cwd);
  const runCommitNote = options.codexRunner ?? runCodexPrompt;

  try {
    const generated = normalizeGeneratedCommitMessage(
      await runCommitNote(cwd, buildCommitNotePrompt({ sequence, task, evidence }))
    );
    if (isValidCommitMessage(generated, sequence)) {
      return generated;
    }
  } catch {}

  return buildFallbackCommitMessage({ sequence, task, evidence });
}

async function stageTrackedChanges(cwd) {
  await runCommand('git', ['add', '-u', '--', '.'], { cwd });
}

async function listUntrackedFiles(cwd) {
  const result = await runCommand('git', ['ls-files', '--others', '--exclude-standard', '--', '.'], { cwd });
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isBlockedUntrackedFile(file) {
  return UNTRACKED_STAGE_BLOCKLIST.some((pattern) => pattern.test(file));
}

function isAllowedUntrackedFile(file) {
  return UNTRACKED_STAGE_ALLOWLIST.some((pattern) => pattern.test(file));
}

async function stageUntrackedFiles(cwd) {
  const files = (await listUntrackedFiles(cwd)).filter((file) => !isBlockedUntrackedFile(file) && isAllowedUntrackedFile(file));
  if (files.length === 0) {
    return;
  }
  await runCommand('git', ['add', '--', ...files], { cwd });
}

async function resolveCommitMessage(cwd, message) {
  if (typeof message === 'function') {
    return message(cwd);
  }
  return message;
}

export async function commitTrackedChanges(cwd, message) {
  await stageTrackedChanges(cwd);
  await stageUntrackedFiles(cwd);
  const staged = await runCommand('git', ['diff', '--cached', '--name-only'], { cwd });
  if (!staged.stdout.trim()) {
    return false;
  }
  const resolvedMessage = await resolveCommitMessage(cwd, message);
  await runCommand('git', ['commit', '-m', resolvedMessage], { cwd, stdio: 'inherit' });
  return true;
}
