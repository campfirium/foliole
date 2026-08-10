import fs from 'node:fs';
import path from 'node:path';

import { runMacosA5SyncGroupApproval } from '../android/macos-a5-sync-group-approval.mjs';
import { executeBounded } from './windows-bounded-process.mjs';

const REMOTE_PREFIX = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/';

function parseRemoteEvidence(output) {
  const match = /^\[windows-dev-action\] sync-group-recover identity=([A-Za-z0-9.-]{1,96}) manifest=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows Sync Group recovery did not report fixed evidence.');
  const remoteRoot = `${REMOTE_PREFIX}${match[1]}`;
  const manifest = match[2].replaceAll('\\', '/');
  if (manifest !== `${remoteRoot}/sync-group-recovery-receipt.json`) {
    throw new Error('Windows Sync Group recovery evidence escaped its fixed root.');
  }
  return { identity: match[1], remoteRoot };
}

async function copyEvidence({ buildScpSpec, env, executeScp, evidence, host, repoRoot }) {
  const localRoot = path.join(repoRoot, '.tmp/artifacts/sync-group-recovery', evidence.identity);
  fs.mkdirSync(localRoot, { recursive: true });
  for (const name of ['sync-group-recovery-receipt.json', 'sync-group-recovery.png', 'summary.json']) {
    await executeScp(buildScpSpec(
      host, `${evidence.remoteRoot}/${name}`, path.join(localRoot, name), env
    ), { env });
  }
  return localRoot;
}

export async function runWindowsSyncGroupRecoveryControl({
  approve = runMacosA5SyncGroupApproval,
  buildPushSpec, buildScpSpec, buildSshSpec, env, executeGit, executeScp, executeSsh,
  host, repoRoot, stdout
}) {
  const push = buildPushSpec(host, env);
  await executeGit(push.args, { env: push.env });
  let remote = null;
  const startRemote = async () => {
    if (remote) throw new Error('Windows Sync Group recovery already started.');
    remote = executeSsh(buildSshSpec(host, 'sync-group-recover', env), { env }).then(
      (output) => ({ error: null, output }),
      (error) => ({ error, output: error.output || error.message })
    );
  };
  let approvalError = null;
  try {
    const approval = await approve({ execute: executeBounded, onReady: startRemote, repoRoot });
    stdout.write(approval.output);
  } catch (error) { approvalError = error; }
  if (!remote) {
    if (approvalError) throw approvalError;
    throw new Error('A5 approval preparation did not start Windows C.');
  }
  const remoteResult = await remote;
  if (remoteResult.output) stdout.write(remoteResult.output);
  if (approvalError) throw approvalError;
  if (remoteResult.error) throw remoteResult.error;
  const evidence = parseRemoteEvidence(remoteResult.output);
  const evidenceRoot = await copyEvidence({
    buildScpSpec, env, evidence, executeScp, host, repoRoot
  });
  return { action: 'sync-group-recover', evidenceRoot, operation: 'complete', ref: 'refs/heads/dev' };
}
