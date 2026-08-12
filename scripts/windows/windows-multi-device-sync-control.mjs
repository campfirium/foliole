import fs from 'node:fs';
import path from 'node:path';

function parseEvidence(output, action, receiptName) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(`^\\[windows-dev-action\\] ${escaped} identity=([A-Za-z0-9.-]{1,96}) manifest=([^\\r\\n]+)$`, 'mu').exec(output);
  if (!match) throw new Error(`Windows ${action} did not report fixed evidence.`);
  const remoteRoot = `C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/${match[1]}`;
  if (match[2].replaceAll('\\', '/') !== `${remoteRoot}/${receiptName}`) {
    throw new Error(`Windows ${action} evidence escaped its fixed root.`);
  }
  return { identity: match[1], remoteRoot };
}

export async function runWindowsMultiDeviceSyncControl({ buildPushSpec, buildScpSpec,
  buildSshSpec, env, executeGit, executeScp, executeSsh, fsApi = fs, host, repoRoot, stdout,
  action = 'multi-device-sync-c' }) {
  const push = buildPushSpec(host, env);
  await executeGit(push.args, { env: push.env });
  const output = await executeSsh(buildSshSpec(host, action, env), { env });
  stdout.write(output);
  const receiptNames = {
    'multi-device-sync-a-leave': 'multi-device-sync-a-leave-receipt.json',
    'multi-device-sync-a-rejoin': 'multi-device-sync-a-rejoin-receipt.json',
    'multi-device-sync-c': 'sync-group-recovery-receipt.json'
  };
  const receiptName = receiptNames[action];
  if (!receiptName) throw new Error(`Unsupported multi-device sync action: ${action}`);
  const evidence = parseEvidence(output, action, receiptName);
  const localRoot = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync',
    'windows-c', evidence.identity);
  fsApi.mkdirSync(localRoot, { recursive: true });
  const manifestPath = path.join(localRoot, `${action}-receipt.json`);
  await executeScp(buildScpSpec(host, `${evidence.remoteRoot}/${receiptName}`,
    manifestPath, env), { env });
  return { action, evidenceRoot: localRoot, manifestPath };
}
