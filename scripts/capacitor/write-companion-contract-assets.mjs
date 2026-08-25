import path from 'node:path';

import { writeFileIfChanged } from '../lib/write-file-if-changed.mjs';

const CONTRACT_OUTPUTS = {
  bridge: [
    'android/app/src/main/assets/companion-bridge-contract-definitions.json',
    'ios/App/App/companion-bridge-contract-definitions.json'
  ],
  sync: [
    'android/app/src/main/assets/companion-sync-protocol-definitions.json',
    'ios/App/App/companion-sync-protocol-definitions.json'
  ],
  syncGroupBridge: {
    android: ['android/app/src/main/assets/companion-sync-group-bridge-contract-definitions.json'],
    ios: [
      'ios/App/App/companion-sync-group-bridge-contract-definitions.json',
      'src/companion/public/companion-sync-group-bridge-contract-definitions.json'
    ]
  }
};

export async function writeCompanionContractAssets(args) {
  await Promise.all([
    writeOutputs(args.repoRoot, CONTRACT_OUTPUTS.bridge, args.bridgeDefinitions),
    writeOutputs(args.repoRoot, CONTRACT_OUTPUTS.sync, args.syncDefinitions),
    writeOutputs(args.repoRoot, CONTRACT_OUTPUTS.syncGroupBridge.android,
      args.syncGroupBridgeDefinitions.android),
    writeOutputs(args.repoRoot, CONTRACT_OUTPUTS.syncGroupBridge.ios,
      args.syncGroupBridgeDefinitions.ios)
  ]);
}

async function writeOutputs(repoRoot, outputs, definitions) {
  const content = `${JSON.stringify(definitions, null, 2)}\n`;
  await Promise.all(outputs.map(async (relativePath) => {
    const outputPath = path.join(repoRoot, relativePath);
    await writeFileIfChanged(outputPath, content);
  }));
}
