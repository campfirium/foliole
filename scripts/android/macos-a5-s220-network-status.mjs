import fs from 'node:fs';
import path from 'node:path';

import { S220_APP_ID } from './macos-a5-s220-package-inventory.mjs';

export function assertS220A5NetworkRestored(network) {
  const lines = network.activeNetwork?.lines ?? [];
  if (network.airplane?.code !== 0 || network.airplane?.output !== '0'
    || network.wifi?.code !== 0 || network.wifi?.output !== '1'
    || network.mobileData?.code !== 0 || network.mobileData?.output !== '0'
    || network.activeNetwork?.code !== 0
    || !lines.some((line) => /^Active default network: \d+$/u.test(line))
    || !lines.some((line) => /WIFI CONNECTED/u.test(line) && /VALIDATED/u.test(line))) {
    throw new Error('S220 A5 Wi-Fi default network was not independently restored.');
  }
}

export async function confirmS220A5NetworkRestored({ assertFixed, execute, paths,
  receipt, serial }) {
  if (receipt.restoreError || JSON.parse(receipt.networkRestored ?? '{}').restored !== true) {
    throw new Error('S220 A5 restoreOnly did not complete; fallback is not proof.');
  }
  const filePath = await inspectS220A5Network({ assertFixed, execute, paths, serial });
  assertS220A5NetworkRestored(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  return filePath;
}

export async function inspectS220A5Network({ assertFixed, execute, paths, serial }) {
  assertFixed();
  const run = async (command) => {
    const result = await execute(paths.adb, ['-s', serial, 'shell', ...command], {
      timeoutMs: 15_000
    });
    return { code: result.code, output: result.stdout.trim().slice(0, 300) };
  };
  const receipt = { appId: S220_APP_ID, capturedAt: new Date().toISOString(), serial,
    airplane: await run(['settings', 'get', 'global', 'airplane_mode_on']),
    wifi: await run(['settings', 'get', 'global', 'wifi_on']),
    mobileData: await run(['settings', 'get', 'global', 'mobile_data']),
    connectivityHelp: await run(['cmd', 'connectivity', 'help']) };
  const connectivity = await execute(paths.adb, ['-s', serial, 'shell',
    'dumpsys', 'connectivity'], { timeoutMs: 15_000 });
  receipt.activeNetwork = { code: connectivity.code,
    lines: connectivity.stdout.split('\n').filter((line) =>
      /Active default network|Default network|NetworkAgentInfo.*WIFI|LinkProperties.*wlan0/iu
        .test(line)).slice(0, 18).map((line) => line.trim()) };
  const filePath = path.join(paths.artifactsRoot, 'S220', 'a5-network-status.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(receipt, null, 2)}\n`);
  return filePath;
}
