import fs from 'node:fs';
import path from 'node:path';

const REMOTE_PREFIX = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/';

function parseEvidence(output) {
  const match = /^\[windows-dev-action\] sync-group-baseline-reset identity=([A-Za-z0-9.-]{1,96}) manifest=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows C baseline reset did not report fixed evidence.');
  const remoteRoot = `${REMOTE_PREFIX}${match[1]}`;
  const manifest = match[2].replaceAll('\\', '/');
  if (manifest !== `${remoteRoot}/sync-group-baseline-reset-manifest.json`) {
    throw new Error('Windows C baseline evidence escaped its fixed root.');
  }
  return { identity: match[1], remoteRoot };
}

export async function runWindowsSyncGroupBaselineControl({ buildPushSpec, buildScpSpec,
  buildSshSpec, env, executeGit, executeScp, executeSsh, host, repoRoot, stdout }) {
  const push = buildPushSpec(host, env);
  await executeGit(push.args, { env: push.env });
  const output = await executeSsh(buildSshSpec(host, 'sync-group-baseline-reset', env), { env });
  if (output) stdout.write(output);
  const evidence = parseEvidence(output);
  const localRoot = path.join(repoRoot, '.tmp', 'artifacts', 'sync-group-baseline-reset', evidence.identity);
  fs.mkdirSync(localRoot, { recursive: true });
  for (const name of ['sync-group-baseline-reset-manifest.json', 'summary.json']) {
    await executeScp(buildScpSpec(host, `${evidence.remoteRoot}/${name}`, path.join(localRoot, name), env), { env });
  }
  return { action: 'sync-group-baseline-reset', evidenceRoot: localRoot,
    operation: 'complete', ref: 'refs/heads/dev' };
}
