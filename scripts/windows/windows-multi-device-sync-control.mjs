import fs from 'node:fs';
import path from 'node:path';

import { WINDOWS_DEV_EVIDENCE_PREFIX } from './windows-dev-paths.mjs';

function parseEvidence(output, action, receiptName) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(`^\\[windows-dev-action\\] ${escaped} identity=([A-Za-z0-9.-]{1,96}) manifest=([^\\r\\n]+)$`, 'mu').exec(output);
  if (!match) throw new Error(`Windows ${action} did not report fixed evidence.`);
  const remoteRoot = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}`;
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
  let streamed = false;
  const output = await executeSsh(buildSshSpec(host, action, env), { env, onOutput: (chunk) => {
    streamed = true; stdout.write(chunk);
  } });
  if (!streamed) stdout.write(output);
  const receiptNames = {
    'desktop-dnssd-route-provider': 'desktop-dnssd-route-provider-receipt.json',
    'desktop-dnssd-route-selfcheck': 'desktop-dnssd-route-controller-selfcheck-receipt.json',
    'multi-device-sync-a-leave': 'multi-device-sync-a-leave-receipt.json',
    'multi-device-sync-a-rejoin': 'multi-device-sync-a-rejoin-receipt.json',
    'multi-device-sync-c': 'sync-group-recovery-receipt.json',
    'multi-device-sync-from-zero': 'multi-device-sync-from-zero-receipt.json',
    'multi-device-sync-participation': 'multi-device-sync-participation-receipt.json',
    'single-principal-sync-group': 'single-principal-sync-group-receipt.json',
    'two-device-sync-provider': 'two-device-sync-provider-receipt.json'
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
  if (action === 'desktop-dnssd-route-selfcheck') {
    for (const relative of ['selfcheck-negative-error.json', 'selfcheck-native-probe.log',
      'desktop-dnssd-route-runtime/action.log', 'desktop-dnssd-route-runtime/receipt.json']) {
      const localPath = path.join(localRoot, relative);
      fsApi.mkdirSync(path.dirname(localPath), { recursive: true });
      await executeScp(buildScpSpec(host, `${evidence.remoteRoot}/${relative}`,
        localPath, env), { env });
    }
  }
  return { action, evidenceRoot: localRoot, manifestPath };
}
