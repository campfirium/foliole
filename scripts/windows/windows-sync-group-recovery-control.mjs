import fs from 'node:fs';
import path from 'node:path';

import { WINDOWS_DEV_EVIDENCE_PREFIX } from './windows-dev-paths.mjs';

const REMOTE_PREFIX = WINDOWS_DEV_EVIDENCE_PREFIX;

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
  buildPushSpec, buildScpSpec, buildSshSpec, env, executeGit, executeScp, executeSsh,
  host, repoRoot, stdout
}) {
  const push = buildPushSpec(host, env);
  await executeGit(push.args, { env: push.env });
  const remoteResult = await executeSsh(buildSshSpec(host, 'sync-group-recover', env), { env }).then(
    (output) => ({ error: null, output }),
    (error) => ({ error, output: error.output || error.message })
  );
  if (remoteResult.output) stdout.write(remoteResult.output);
  if (remoteResult.error) throw remoteResult.error;
  const evidence = parseRemoteEvidence(remoteResult.output);
  const evidenceRoot = await copyEvidence({
    buildScpSpec, env, evidence, executeScp, host, repoRoot
  });
  return { action: 'sync-group-recover', evidenceRoot, operation: 'complete', ref: 'refs/heads/dev' };
}
