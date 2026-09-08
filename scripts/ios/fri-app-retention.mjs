import fs from 'node:fs';
import path from 'node:path';

export const FRI_COREDEVICE_ID = 'CB302BF0-6B5B-5737-8DA8-21F8081E19E7';
export const FRI_PRODUCTION_APP_ID = 'com.foliole.ios';
export const FRI_DEV_SUFFIX = '.devworkflow';
export const FRI_T152_SUFFIX = '.t152acceptance';

function appIdsForSuffix(suffix) {
  return [
    `com.foliole.ios${suffix}`,
    `com.foliole.ios.physical-uitests${suffix}.xctrunner`,
    `com.foliole.ios.acceptance-projection-tests${suffix}.xctrunner`
  ];
}

export const FRI_RETAINED_DEVELOPMENT_APP_IDS = new Set([
  FRI_PRODUCTION_APP_ID,
  ...appIdsForSuffix(FRI_DEV_SUFFIX),
  ...appIdsForSuffix(FRI_T152_SUFFIX)
]);

function installedApps(inventory) {
  if (inventory?.info?.outcome !== 'success' || !Array.isArray(inventory?.result?.apps)) {
    throw new Error('Fri application inventory is missing or invalid.');
  }
  return inventory.result.apps;
}

export function staleFriDevelopmentAppIds(inventory) {
  return installedApps(inventory)
    .map(({ bundleIdentifier }) => bundleIdentifier)
    .filter((bundleId) => typeof bundleId === 'string'
      && bundleId.startsWith(`${FRI_PRODUCTION_APP_ID}.`)
      && !FRI_RETAINED_DEVELOPMENT_APP_IDS.has(bundleId))
    .sort();
}

export function freshFriAcceptanceAppIds(inventory) {
  const installed = new Set(installedApps(inventory).map(({ bundleIdentifier }) => bundleIdentifier));
  return appIdsForSuffix(FRI_T152_SUFFIX).filter((bundleId) => installed.has(bundleId));
}

function requireSuccess(result, stage) {
  if (result?.code !== undefined && result.code !== 0) {
    throw new Error(`${stage} failed with exit code ${result.code}.`);
  }
}

async function readFriAppInventory({ evidenceRoot, fileName, run }) {
  const inventoryPath = path.join(evidenceRoot, fileName);
  const result = await run('xcrun', [
    'devicectl', 'device', 'info', 'apps', '--device', FRI_COREDEVICE_ID,
    '--json-output', inventoryPath
  ], { action: 'fri-app-inventory', hardDeadlineMs: 60_000, host: 'ios-b',
    stage: 'fri-app-retention' });
  requireSuccess(result, 'Fri application inventory');
  return JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
}

export async function retainFriDevelopmentApps({ evidenceRoot, freshT152 = false, run }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const inventory = await readFriAppInventory({
    evidenceRoot, fileName: 'installed-apps-before.json', run
  });
  const stale = staleFriDevelopmentAppIds(inventory);
  const fresh = freshT152 ? freshFriAcceptanceAppIds(inventory) : [];
  const removed = [...new Set([...stale, ...fresh])].sort();
  for (const bundleId of removed) {
    const result = await run('xcrun', [
      'devicectl', 'device', 'uninstall', 'app', '--device', FRI_COREDEVICE_ID, bundleId
    ], { action: 'fri-app-uninstall', hardDeadlineMs: 60_000, host: 'ios-b',
      stage: 'fri-app-retention' });
    requireSuccess(result, `Fri uninstall ${bundleId}`);
  }

  const after = await readFriAppInventory({
    evidenceRoot, fileName: 'installed-apps-after.json', run
  });
  const remaining = [...staleFriDevelopmentAppIds(after),
    ...(freshT152 ? freshFriAcceptanceAppIds(after) : [])];
  if (remaining.length > 0) {
    throw new Error(`Fri application retention left managed apps installed: ${remaining.join(', ')}`);
  }
  const receipt = { deviceId: FRI_COREDEVICE_ID, freshT152, removed,
    retained: [...FRI_RETAINED_DEVELOPMENT_APP_IDS].sort(), schemaVersion: 1 };
  fs.writeFileSync(path.join(evidenceRoot, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}
