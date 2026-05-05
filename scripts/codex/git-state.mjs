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

function tokenizeTask(task) {
  return task
    .toLowerCase()
    .replace(/[`"]/g, '')
    .match(/[a-z0-9]+/g);
}

const SUBJECT_STOP_WORDS = new Set(['context', 'change', 'intent']);

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

export async function buildCommitMessage(cwd, task) {
  const sequence = await getNextCommitSequence(cwd);
  const normalizedTask = escapeBodyValue(buildCommitTopic(task || 'current repository task'));
  const subject = normalizedTask || 'agent loop checkpoint';

  return [
    `${sequence} ${subject}`,
    '',
    'context: agent loop completed one automated repository task.',
    'change: apply the staged code and test updates from the latest loop iteration.',
    'intent: keep automated progress traceable with repository-standard commit notes.'
  ].join('\n');
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

export async function commitTrackedChanges(cwd, message) {
  await stageTrackedChanges(cwd);
  await stageUntrackedFiles(cwd);
  const staged = await runCommand('git', ['diff', '--cached', '--name-only'], { cwd });
  if (!staged.stdout.trim()) {
    return false;
  }
  await runCommand('git', ['commit', '-m', message], { cwd, stdio: 'inherit' });
  return true;
}
