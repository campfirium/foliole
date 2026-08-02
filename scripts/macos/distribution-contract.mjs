import path from 'node:path';

export const MACOS_DISTRIBUTION = Object.freeze({
  appId: 'com.campfirium.foliole',
  teamId: 'V589TQH334'
});

const GITHUB_DISTRIBUTION = Object.freeze({
  entitlements: 'build/entitlements.mac.plist',
  entitlementsInherit: 'build/entitlements.mac.inherit.plist',
  signScript: 'scripts/macos/sign-github-app.mjs'
});

const MAS_DISTRIBUTION = Object.freeze({
  entitlements: 'build/entitlements.mas.plist',
  entitlementsInherit: 'build/entitlements.mas.inherit.plist',
  signScript: 'scripts/macos/sign-mas-app.mjs'
});

function isStandardElectronRuntime(electronDist) {
  const normalized = path.normalize(electronDist ?? '');
  return normalized.endsWith(path.join('node_modules', 'electron', 'dist'));
}

function requireContract(condition, message) {
  if (!condition) throw new Error(`macOS distribution contract violation: ${message}`);
}

function assertCommon(config, channelConfig, expected) {
  requireContract(config.appId === MACOS_DISTRIBUTION.appId, 'bundle id changed');
  requireContract(channelConfig.entitlements === expected.entitlements, 'channel entitlements changed');
  requireContract(
    channelConfig.entitlementsInherit === expected.entitlementsInherit,
    'channel helper entitlements changed'
  );
  requireContract(channelConfig.sign === expected.signScript, 'signing entry changed');
  requireContract(Boolean(channelConfig.provisioningProfile), 'provisioning profile is required');
}

export function assertGithubDistributionContract(config) {
  requireContract(config.extraMetadata?.folioleBuildChannel === 'github', 'GitHub build channel changed');
  requireContract(
    typeof config.electronDist === 'string' && isStandardElectronRuntime(config.electronDist),
    'GitHub packages must use the standard Electron runtime'
  );
  assertCommon(config, config.mac ?? {}, GITHUB_DISTRIBUTION);
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
  requireContract(config.extraMetadata?.folioleBuildChannel === 'mas', 'MAS build channel changed');
  assertCommon(config, channel ?? {}, MAS_DISTRIBUTION);
  requireContract(
    typeof config.electronDist === 'string' && path.basename(config.electronDist).startsWith('electron-mas-'),
    'MAS target must use the prepared local MAS Electron runtime'
  );
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

export function assertDeveloperIdEntitlements(source) {
  requireContract(
    !source.includes('<key>com.apple.security.app-sandbox</key>'),
    'Developer ID app must not use App Sandbox'
  );
  for (const entitlement of [
    'com.apple.security.application-groups',
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory',
    'com.apple.security.files.bookmarks.app-scope',
    'com.apple.security.files.user-selected.read-write'
  ]) {
    requireContract(source.includes(`<key>${entitlement}</key>`), `missing ${entitlement}`);
  }
}
