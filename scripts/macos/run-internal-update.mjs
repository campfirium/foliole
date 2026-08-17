#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { submitInternalUpdateFailureHandoff } from './internal-update-handoff.mjs';

function assertRevision(revision) {
  if (!/^[0-9a-f]{40}$/u.test(revision ?? '')) {
    throw new Error('Internal build requires a full Git revision');
  }
  return revision;
}

function runStep(label, command, args, options, run) {
  const result = run(command, args, { ...options, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

const IRRELEVANT_PREFIXES = [
  '.github/', '.lab/', 'android/', 'docs/', 'ios/', 'scripts/android/',
  'scripts/codex/', 'scripts/quality/', 'scripts/windows/', 'src/companion/', 'tests/'
];
const IRRELEVANT_FILES = new Set([
  'AGENTS.md', 'DESIGN.md', 'capacitor.config.ts', 'playwright.config.ts',
  'playwright.desktop.config.ts', 'vite.companion.config.ts'
]);

export function isInternalPackagingIrrelevantPath(filePath) {
  return IRRELEVANT_FILES.has(filePath) ||
    IRRELEVANT_PREFIXES.some((prefix) => filePath.startsWith(prefix)) ||
    /(^|\/)AGENTS\.md$/u.test(filePath) ||
    /\.(test|spec)\.[^.]+$/u.test(filePath) ||
    /^scripts\/(check-|lint-)/u.test(filePath);
}

export function resolveInternalPackagingDecision(changedFiles) {
  return changedFiles.every(isInternalPackagingIrrelevantPath) ? 'skip' : 'build';
}

export function createInternalBuildSteps(options) {
  const archivePath = path.join(options.temporaryRoot, 'source.tar');
  const sourceRoot = path.join(options.temporaryRoot, 'source');
  const cacheSteps = options.includeCodexCache ? [
    {
      args: ['-p', path.join(sourceRoot, '.tmp/macos')], command: '/bin/mkdir',
      cwd: options.repositoryRoot, label: 'prepare fixed Internal helper root'
    },
    {
      args: ['-cR', path.join(options.repositoryRoot, '.tmp/macos/codex'), path.join(sourceRoot, '.tmp/macos/codex')],
      command: '/bin/cp', cwd: options.repositoryRoot, label: 'clone verified Codex helper cache'
    }
  ] : [];
  return {
    archivePath,
    sourceRoot,
    steps: [
      {
        args: ['archive', '--format=tar', `--output=${archivePath}`, options.revision],
        command: 'git',
        cwd: options.repositoryRoot,
        label: 'archive fixed Internal input'
      },
      {
        args: ['-xf', archivePath, '-C', sourceRoot],
        command: 'tar',
        cwd: options.repositoryRoot,
        label: 'expand fixed Internal input'
      },
      {
        args: ['-cR', path.join(options.repositoryRoot, 'node_modules'), path.join(sourceRoot, 'node_modules')],
        command: '/bin/cp',
        cwd: options.repositoryRoot,
        label: 'clone Internal dependencies'
      },
      {
        args: ['-p', path.join(sourceRoot, '.tmp')], command: '/bin/mkdir',
        cwd: options.repositoryRoot, label: 'prepare fixed Internal runtime root'
      },
      {
        args: [
          '-cR', path.join(options.repositoryRoot, '.tmp/electron-mas-arm64'),
          path.join(sourceRoot, '.tmp/electron-mas-arm64')
        ],
        command: '/bin/cp', cwd: options.repositoryRoot, label: 'clone prepared Internal MAS Electron runtime'
      },
      ...cacheSteps,
      {
        args: ['run', 'macos:internal:update'],
        command: 'npm',
        cwd: sourceRoot,
        label: 'build and restart Foliole Internal'
      }
    ]
  };
}

function splitFiles(output) {
  return output.split(/\r?\n/u).map((file) => file.trim()).filter(Boolean);
}

function inspectChanges(repositoryRoot, baseline, revision, run) {
  if (!baseline || !/^[0-9a-f]{40}$/u.test(baseline)) return { changedFiles: null, stale: false };
  const stale = run('git', ['merge-base', '--is-ancestor', revision, baseline], { cwd: repositoryRoot }).status === 0;
  if (stale) return { changedFiles: [], stale: true };
  const result = run('git', ['diff', '--name-only', `${baseline}..${revision}`, '--', '.'], {
    cwd: repositoryRoot, encoding: 'utf8'
  });
  return result.status === 0 ? { changedFiles: splitFiles(result.stdout ?? ''), stale: false } : { changedFiles: null, stale: false };
}

async function readAccountedRevision(stateRoot) {
  try {
    return (await readFile(path.join(stateRoot, 'accounted-revision'), 'utf8')).trim();
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeAccountedRevision(stateRoot, revision) {
  await writeFile(path.join(stateRoot, 'accounted-revision'), `${revision}\n`);
}

export async function runInternalUpdate(options) {
  const revision = assertRevision(options.revision);
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const run = options.run ?? spawnSync;
  const makeTempDirectory = options.makeTempDirectory ?? mkdtemp;
  const makeDirectory = options.makeDirectory ?? mkdir;
  const remove = options.remove ?? rm;
  const stateRoot = options.stateRoot ?? path.join(repositoryRoot, '.tmp/macos/internal-update');
  await makeDirectory(stateRoot, { recursive: true });
  const baseline = options.baseline === undefined ? await readAccountedRevision(stateRoot) : options.baseline;
  const inspection = options.inspection ?? inspectChanges(repositoryRoot, baseline, revision, run);
  if (inspection.stale) {
    console.log(`[internal-update] skipped stale revision=${revision}`);
    return { revision, status: 'skipped' };
  }
  if (!options.force && inspection.changedFiles
    && resolveInternalPackagingDecision(inspection.changedFiles) === 'skip') {
    await (options.writeBaseline ?? writeAccountedRevision)(stateRoot, revision);
    console.log(`[internal-update] skipped irrelevant revision=${revision}`);
    return { revision, status: 'skipped' };
  }
  const temporaryRoot = await makeTempDirectory(path.join(tmpdir(), 'foliole-internal-source-'));
  const cacheRoot = path.join(repositoryRoot, '.tmp/macos/codex');
  const pathExists = options.pathExists ?? (async (candidate) => access(candidate).then(() => true, () => false));
  const build = createInternalBuildSteps({
    includeCodexCache: await pathExists(cacheRoot), repositoryRoot, revision, temporaryRoot
  });
  try {
    await makeDirectory(build.sourceRoot);
    console.log(`[internal-update] building revision=${revision}`);
    for (const step of build.steps) {
      runStep(step.label, step.command, step.args, {
        cwd: step.cwd,
        env: { ...process.env, FOLIOLE_INTERNAL_BUILD_REVISION: revision }
      }, run);
    }
    await (options.writeBaseline ?? writeAccountedRevision)(stateRoot, revision);
    console.log(`[internal-update] completed revision=${revision}`);
    return { revision, status: 'installed' };
  } finally {
    await remove(temporaryRoot, { force: true, recursive: true });
  }
}

export async function runInternalUpdateWithHandoff(options, dependencies = {}) {
  const update = dependencies.update ?? runInternalUpdate;
  const submitFailure = dependencies.submitFailure ?? submitInternalUpdateFailureHandoff;
  try {
    return await update(options);
  } catch (error) {
    try {
      submitFailure({ ...options, error });
    } catch (handoffError) {
      (dependencies.logError ?? console.error)(
        `Foliole Internal failure handoff failed: ${handoffError.message}`
      );
    }
    throw error;
  }
}

function parseArgs(argv) {
  const read = (flag) => argv[argv.indexOf(flag) + 1];
  return { repositoryRoot: read('--repository'), revision: read('--revision'), stateRoot: read('--state-root') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  runInternalUpdateWithHandoff(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
