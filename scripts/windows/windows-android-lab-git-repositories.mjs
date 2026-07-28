#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  androidLabPaths, WINDOWS_ANDROID_LAB_RUNTIME_REF, WINDOWS_ANDROID_LAB_SOURCE_REF
} from './windows-android-lab-state.mjs';

function runGit(gitPath, args) {
  const result = spawnSync(gitPath, args, { encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || 'Git failed').trim());
}

function fixedRefHook(ref) {
  return `#!/bin/sh
while read old new updated_ref; do
  if [ "$updated_ref" != "${ref}" ]; then
    echo "only ${ref} is accepted" >&2
    exit 1
  fi
  if [ "$new" = "0000000000000000000000000000000000000000" ]; then
    echo "${ref} cannot be deleted" >&2
    exit 1
  fi
done
`;
}

export function configureAndroidLabGitRepositories({ gitPath, paths, run = runGit }) {
  const repositories = [
    { ref: WINDOWS_ANDROID_LAB_SOURCE_REF, root: paths.repository },
    { ref: WINDOWS_ANDROID_LAB_RUNTIME_REF, root: paths.runtimeRepository }
  ];
  for (const repository of repositories) {
    if (!fs.existsSync(path.join(repository.root, 'HEAD'))) run(gitPath, ['init', '--bare', repository.root]);
    run(gitPath, ['--git-dir', repository.root, 'config', 'receive.denyDeletes', 'true']);
    run(gitPath, ['--git-dir', repository.root, 'config', 'receive.denyNonFastForwards', 'true']);
    const hookPath = path.join(repository.root, 'hooks', 'pre-receive');
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, fixedRefHook(repository.ref), { encoding: 'utf8', mode: 0o755 });
  }
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== '--root' || argv[2] !== '--git-path') {
    throw new Error('usage: windows-android-lab-git-repositories.mjs --root <install-root> --git-path <git.exe>');
  }
  return { gitPath: path.resolve(argv[3]), paths: androidLabPaths(path.resolve(argv[1])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    configureAndroidLabGitRepositories(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`[windows-android-lab-git-repositories] ${error.message}`);
    process.exitCode = 1;
  }
}
