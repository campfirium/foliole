import os from 'node:os';

import {
  WINDOWS_ANDROID_LAB_PROTOCOL_VERSION, WINDOWS_ANDROID_LAB_RUNTIME_REF, WINDOWS_ANDROID_LAB_SOURCE_REF
} from './windows-android-lab-state.mjs';

const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const LAB_REPAIR_REPOSITORY = 'foliole-android-lab-repair.git';
const LAB_RUNTIME_REPOSITORY = 'foliole-android-lab-runtime.git';
const LAB_SOURCE_REPOSITORY = 'foliole-android-lab.git';
const LEGACY_RUNTIME_PROTOCOL_MIN = 5;

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

async function createBootstrapCarrier({ commitSha, env, executeGit, expectedCurrentSha }) {
  const branch = String(await executeGit(['branch', '--show-current'], { env })).trim();
  if (branch !== 'dev') throw new Error('Android Lab runtime bootstrap requires the dev branch');
  for (const sha of [commitSha, expectedCurrentSha]) {
    const verified = String(await executeGit(['rev-parse', '--verify', `${sha}^{commit}`], { env })).trim();
    if (!COMMIT_SHA.test(sha) || verified !== sha) throw new Error('Android Lab runtime bootstrap commit is invalid');
  }
  await executeGit(['merge-base', '--is-ancestor', commitSha, 'HEAD'], { env });
  const treeSha = String(await executeGit(['rev-parse', '--verify', `${commitSha}^{tree}`], { env })).trim();
  const carrierSha = String(await executeGit([
    'commit-tree', treeSha, '-p', expectedCurrentSha, '-m', `Windows Android Lab runtime bootstrap ${commitSha}`
  ], { env })).trim();
  if (!COMMIT_SHA.test(treeSha) || !COMMIT_SHA.test(carrierSha)) {
    throw new Error('Android Lab runtime bootstrap carrier is invalid');
  }
  return { carrierSha, treeSha };
}

function fixedGitSpec({ env, host, key, quoteToken, repository, args }) {
  return {
    args: [...args, `${host}:${repository}`],
    env: gitSshEnvironment(env, key, quoteToken)
  };
}

async function pushBootstrapCarrier({ carrierSha, env, executeGit, expectedCurrentSha, host, key, quoteToken }) {
  const spec = fixedGitSpec({
    args: ['push', '--porcelain', `--force-with-lease=${WINDOWS_ANDROID_LAB_SOURCE_REF}:${expectedCurrentSha}`],
    env, host, key, quoteToken, repository: LAB_SOURCE_REPOSITORY
  });
  spec.args.push(`${carrierSha}:${WINDOWS_ANDROID_LAB_SOURCE_REF}`);
  await executeGit(spec.args, { env: spec.env });
}

function parseStatus(raw) {
  try {
    return JSON.parse(String(raw));
  } catch {
    throw new Error('Windows Android Lab bootstrap status is unreadable');
  }
}

function assertLegacyBootstrapProtocol(status) {
  if (!Number.isInteger(status.protocolVersion) || status.protocolVersion < LEGACY_RUNTIME_PROTOCOL_MIN
    || status.protocolVersion >= WINDOWS_ANDROID_LAB_PROTOCOL_VERSION) {
    throw new Error(`runtime bootstrap requires protocol ${LEGACY_RUNTIME_PROTOCOL_MIN}..${WINDOWS_ANDROID_LAB_PROTOCOL_VERSION - 1}`);
  }
}

function assertRuntimeUpdated(raw, commitSha) {
  const result = parseStatus(raw);
  if (result.status !== 'updated' || result.commitSha !== commitSha) {
    throw new Error('Windows Android Lab runtime update did not confirm the requested commit');
  }
}

async function repairBootstrapRef({ carrierSha, commitSha, env, executeGit, host, key, quoteToken }) {
  const spec = fixedGitSpec({
    args: ['push', '--porcelain', `--force-with-lease=${WINDOWS_ANDROID_LAB_SOURCE_REF}:${carrierSha}`],
    env, host, key, quoteToken, repository: LAB_REPAIR_REPOSITORY
  });
  spec.args.push(`+${commitSha}:${WINDOWS_ANDROID_LAB_SOURCE_REF}`);
  await executeGit(spec.args, { env: spec.env });
}

async function bootstrapAndroidLabRuntime({
  command, env, executeGit, executeSsh, host, preflight, quoteToken, resolveRemotePaths, stdout
}) {
  if (command.length !== 6 || command[1] !== 'bootstrap' || command[2] !== '--commit'
    || command[4] !== '--expected-current' || !COMMIT_SHA.test(command[3]) || !COMMIT_SHA.test(command[5])) {
    throw new Error('runtime bootstrap requires --commit <formal SHA> --expected-current <legacy Lab SHA>');
  }
  const commitSha = command[3];
  const expectedCurrentSha = command[5];
  const status = parseStatus(await executeSsh(host, ['status'], env, null));
  assertLegacyBootstrapProtocol(status);
  const { carrierSha } = await createBootstrapCarrier({ commitSha, env, executeGit, expectedCurrentSha });
  const key = resolveRemotePaths(env, os.homedir()).gitSshKey;
  await pushBootstrapCarrier({ carrierSha, env, executeGit, expectedCurrentSha, host, key, quoteToken });
  try {
    assertRuntimeUpdated(await executeSsh(host, ['runtime', 'update', carrierSha], env, null), carrierSha);
    await preflight(host, env, executeSsh);
    const published = await publishAndroidLabRuntime({ commitSha, env, executeGit, host, quoteToken, resolveRemotePaths });
    assertRuntimeUpdated(await executeSsh(host, runtimeUpdateCommand(published), env, null), commitSha);
    await repairBootstrapRef({ carrierSha, commitSha, env, executeGit, host, key, quoteToken });
    const result = {
      carrierSha, commitSha, fromProtocol: status.protocolVersion, operation: 'runtime-bootstrap',
      previousLabSha: expectedCurrentSha, schemaVersion: 1, status: 'updated'
    };
    stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } catch (error) {
    throw new Error(
      `${error.message}\nRuntime bootstrap stopped with Lab ref at carrier ${carrierSha}. ` +
      `If the Lab is still legacy, rerun bootstrap with --expected-current ${carrierSha}; ` +
      `if it is current, run runtime update ${commitSha} then repair with --expected-current ${carrierSha}`
    );
  }
}

function runtimeUpdateCommand(published) {
  return ['runtime', 'update', published.commitSha, published.treeSha];
}

export async function runAndroidLabRuntimeUpdate({
  command, env, executeGit, executeSsh, host, output, preflight, quoteToken, resolveRemotePaths, stdout
}) {
  if (command[1] === 'bootstrap') {
    if (output) throw new Error('runtime bootstrap does not accept --output');
    return bootstrapAndroidLabRuntime({
      command, env, executeGit, executeSsh, host, preflight, quoteToken, resolveRemotePaths, stdout
    });
  }
  if (output || command.length !== 3 || command[1] !== 'update' || !COMMIT_SHA.test(command[2])) {
    throw new Error('runtime requires update <formal SHA> and does not accept --output');
  }
  try {
    await preflight(host, env, executeSsh);
  } catch (error) {
    throw new Error(
      `${error.message}\nLegacy runtime recovery requires the explicit audited action: ` +
      'runtime bootstrap --commit <formal SHA> --expected-current <legacy Lab SHA>'
    );
  }
  const published = await publishAndroidLabRuntime({
    commitSha: command[2], env, executeGit, host, quoteToken, resolveRemotePaths
  });
  const result = await executeSsh(host, runtimeUpdateCommand(published), env, null);
  stdout.write(result);
  if (result.length > 0 && result.at(-1) !== 10) stdout.write('\n');
  return published;
}
