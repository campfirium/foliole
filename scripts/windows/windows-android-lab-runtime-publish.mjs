import os from 'node:os';

import { WINDOWS_ANDROID_LAB_RUNTIME_REF } from './windows-android-lab-state.mjs';

const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const LAB_RUNTIME_REPOSITORY = 'foliole-android-lab-runtime.git';

function gitSshEnvironment(env, key, quoteToken) {
  return {
    ...env,
    GIT_SSH_COMMAND:
      `ssh -i ${quoteToken(key)} ` +
      '-o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=yes'
  };
}

export async function publishAndroidLabRuntime({
  commitSha, env, executeGit, host, quoteToken, resolveRemotePaths
}) {
  const branch = String(await executeGit(['branch', '--show-current'], { env })).trim();
  if (branch !== 'dev') throw new Error('Android Lab runtime update requires the dev branch');
  const verified = String(await executeGit(['rev-parse', '--verify', `${commitSha}^{commit}`], { env })).trim();
  if (!COMMIT_SHA.test(commitSha) || verified !== commitSha) throw new Error('Android Lab runtime commit is invalid');
  await executeGit(['merge-base', '--is-ancestor', commitSha, 'HEAD'], { env });
  const treeSha = String(await executeGit(['rev-parse', '--verify', `${commitSha}:scripts/windows`], { env })).trim();
  if (!COMMIT_SHA.test(treeSha)) throw new Error('Android Lab runtime tree is invalid');
  const key = resolveRemotePaths(env, os.homedir()).gitSshKey;
  await executeGit([
    'push', '--porcelain', `${host}:${LAB_RUNTIME_REPOSITORY}`, `${commitSha}:${WINDOWS_ANDROID_LAB_RUNTIME_REF}`
  ], { env: gitSshEnvironment(env, key, quoteToken) });
  return { commitSha, ref: WINDOWS_ANDROID_LAB_RUNTIME_REF, schemaVersion: 1, treeSha };
}

function runtimeUpdateCommand(published) {
  return ['runtime', 'update', published.commitSha, published.treeSha];
}

export async function runAndroidLabRuntimeUpdate({
  command, env, executeGit, executeSsh, host, output, preflight, quoteToken, resolveRemotePaths, stdout
}) {
  if (output || command.length !== 3 || command[1] !== 'update' || !COMMIT_SHA.test(command[2])) {
    throw new Error('runtime requires update <formal SHA> and does not accept --output');
  }
  await preflight(host, env, executeSsh);
  const published = await publishAndroidLabRuntime({
    commitSha: command[2], env, executeGit, host, quoteToken, resolveRemotePaths
  });
  const result = await executeSsh(host, runtimeUpdateCommand(published), env, null);
  stdout.write(result);
  if (result.length > 0 && result.at(-1) !== 10) stdout.write('\n');
  return published;
}
