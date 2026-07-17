#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function assertRevision(revision) {
  if (!/^[0-9a-f]{40}$/u.test(revision ?? '')) {
    throw new Error('Dogfood build requires a full Git revision');
  }
  return revision;
}

function runStep(label, command, args, options, run) {
  const result = run(command, args, { ...options, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}

export function createDogfoodBuildSteps(options) {
  const archivePath = path.join(options.temporaryRoot, 'source.tar');
  const sourceRoot = path.join(options.temporaryRoot, 'source');
  return {
    archivePath,
    sourceRoot,
    steps: [
      {
        args: ['archive', '--format=tar', `--output=${archivePath}`, options.revision],
        command: 'git',
        cwd: options.repositoryRoot,
        label: 'archive fixed Dogfood input'
      },
      {
        args: ['-xf', archivePath, '-C', sourceRoot],
        command: 'tar',
        cwd: options.repositoryRoot,
        label: 'expand fixed Dogfood input'
      },
      {
        args: ['-cR', path.join(options.repositoryRoot, 'node_modules'), path.join(sourceRoot, 'node_modules')],
        command: '/bin/cp',
        cwd: options.repositoryRoot,
        label: 'clone Dogfood dependencies'
      },
      {
        args: ['run', 'macos:mas:dev'],
        command: 'npm',
        cwd: sourceRoot,
        label: 'build and restart Dogfood Daily'
      }
    ]
  };
}

export async function runDogfoodDailyBuild(options) {
  const revision = assertRevision(options.revision);
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const run = options.run ?? spawnSync;
  const makeTempDirectory = options.makeTempDirectory ?? mkdtemp;
  const makeDirectory = options.makeDirectory ?? mkdir;
  const remove = options.remove ?? rm;
  const temporaryRoot = await makeTempDirectory(path.join(tmpdir(), 'foliole-dogfood-source-'));
  const build = createDogfoodBuildSteps({ repositoryRoot, revision, temporaryRoot });
  try {
    await makeDirectory(build.sourceRoot);
    console.log(`[dogfood-daily] building revision=${revision}`);
    for (const step of build.steps) {
      runStep(step.label, step.command, step.args, {
        cwd: step.cwd,
        env: { ...process.env, FOLIOLE_DOGFOOD_BUILD_REVISION: revision }
      }, run);
    }
    console.log(`[dogfood-daily] completed revision=${revision}`);
  } finally {
    await remove(temporaryRoot, { force: true, recursive: true });
  }
}

function parseArgs(argv) {
  const read = (flag) => argv[argv.indexOf(flag) + 1];
  return { repositoryRoot: read('--repository'), revision: read('--revision') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  runDogfoodDailyBuild(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
