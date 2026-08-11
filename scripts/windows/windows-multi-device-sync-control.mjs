import fs from 'node:fs';
import path from 'node:path';

function parseEvidence(output) {
  const match = /^\[windows-dev-action\] multi-device-sync-c identity=([A-Za-z0-9.-]{1,96}) manifest=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows C formal sync did not report fixed evidence.');
  const remoteRoot = `C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/${match[1]}`;
  if (match[2].replaceAll('\\', '/') !== `${remoteRoot}/sync-group-recovery-receipt.json`) {
    throw new Error('Windows C formal sync evidence escaped its fixed root.');
  }
  return { identity: match[1], remoteRoot };
}

export async function runWindowsMultiDeviceSyncControl({ buildPushSpec, buildScpSpec,
  buildSshSpec, env, executeGit, executeScp, executeSsh, fsApi = fs, host, repoRoot, stdout }) {
  const push = buildPushSpec(host, env);
  await executeGit(push.args, { env: push.env });
  const output = await executeSsh(buildSshSpec(host, 'multi-device-sync-c', env), { env });
  stdout.write(output);
  const evidence = parseEvidence(output);
  const localRoot = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync',
    'windows-c', evidence.identity);
  fsApi.mkdirSync(localRoot, { recursive: true });
  const manifestPath = path.join(localRoot, 'multi-device-sync-c-receipt.json');
  await executeScp(buildScpSpec(host, `${evidence.remoteRoot}/sync-group-recovery-receipt.json`,
    manifestPath, env), { env });
  return { action: 'multi-device-sync-c', evidenceRoot: localRoot, manifestPath };
}
