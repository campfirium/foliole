import path from 'node:path';

export const MACOS_DISTRIBUTION = Object.freeze({
  appId: 'com.campfirium.foliole',
  entitlements: 'build/entitlements.mas.plist',
  entitlementsInherit: 'build/entitlements.mas.inherit.plist',
  signScript: 'scripts/macos/sign-mas-app.mjs',
  teamId: 'V589TQH334'
});

function requireContract(condition, message) {
  if (!condition) throw new Error(`macOS distribution contract violation: ${message}`);
}

function assertCommon(config, channelConfig) {
  requireContract(config.appId === MACOS_DISTRIBUTION.appId, 'bundle id changed');
  requireContract(channelConfig.entitlements === MACOS_DISTRIBUTION.entitlements, 'sandbox entitlements changed');
  requireContract(
    channelConfig.entitlementsInherit === MACOS_DISTRIBUTION.entitlementsInherit,
    'helper sandbox entitlements changed'
  );
  requireContract(channelConfig.sign === MACOS_DISTRIBUTION.signScript, 'signing entry changed');
  requireContract(Boolean(channelConfig.provisioningProfile), 'provisioning profile is required');
}

export function assertGithubDistributionContract(config) {
  requireContract(
    typeof config.electronDist === 'string' && path.basename(config.electronDist).startsWith('electron-mas-'),
    'GitHub packages must use the cached MAS Electron runtime'
  );
  assertCommon(config, config.mac ?? {});
  requireContract(config.mac.identity?.startsWith('CAMPFIRIUM LTD'), 'Developer ID identity changed');
  requireContract(config.mac.hardenedRuntime === true, 'GitHub package must use Hardened Runtime');
  requireContract(config.mac.preAutoEntitlements === true, 'Developer ID entitlements must be derived before signing');
  requireContract(config.mac.extendInfo?.ElectronTeamID === MACOS_DISTRIBUTION.teamId, 'Electron team id changed');
  requireContract(
    ['dmg', 'zip'].every((target) => config.mac.target?.includes(target)),
    'GitHub package must produce DMG and ZIP'
  );
}

export function assertMasDistributionContract(config, mode) {
  const channel = mode === 'development' ? config.masDev : config.mas;
  assertCommon(config, channel ?? {});
  requireContract(config.electronDist == null, 'MAS target must let electron-builder select the MAS runtime');
  requireContract(
    config.mac?.target?.includes(mode === 'development' ? 'mas-dev' : 'mas'),
    'MAS target changed'
  );
  requireContract(channel.hardenedRuntime === true, 'MAS package must retain Hardened Runtime');
}

export function assertSandboxEntitlements(source) {
  for (const entitlement of [
    'com.apple.security.app-sandbox',
    'com.apple.security.files.bookmarks.app-scope',
    'com.apple.security.files.user-selected.read-write'
  ]) {
    requireContract(source.includes(`<key>${entitlement}</key>`), `missing ${entitlement}`);
  }
}
