import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TEAM = 'V589TQH334';
const GROUP = 'group.com.campfirium.foliole.ios.share';
const APP_BUNDLE = 'com.campfirium.foliole.ios';

function plist(file) {
  return JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));
}

function decodePlist(xml) {
  return JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: xml, encoding: 'utf8' }));
}

function profileMetadata(xml) {
  const script = [
    'import json, plistlib, sys',
    'profile = plistlib.loads(sys.stdin.buffer.read())',
    'entitlements = profile["Entitlements"]',
    'json.dump({"ProvisionedDevices": "ProvisionedDevices" in profile,',
    '"ProvisionsAllDevices": profile.get("ProvisionsAllDevices", False),',
    '"Entitlements": {key: entitlements.get(key) for key in ["get-task-allow", "application-identifier"]}}, sys.stdout)'
  ].join('\n');
  return JSON.parse(execFileSync('/usr/bin/python3', ['-c', script], { input: xml, encoding: 'utf8' }));
}

export function verifyIosBundleMetadata(info, entitlements, candidate, bundleId) {
  if (info.CFBundleIdentifier !== bundleId || info.CFBundleShortVersionString !== candidate.version ||
      info.CFBundleVersion !== candidate.buildNumber) throw new Error('Signed iPhone bundle identity mismatch');
  if (entitlements['application-identifier'] !== `${TEAM}.${bundleId}` ||
      entitlements['com.apple.developer.team-identifier'] !== TEAM ||
      entitlements['get-task-allow'] !== false ||
      !entitlements['com.apple.security.application-groups']?.includes(GROUP)) {
    throw new Error('iPhone distribution entitlements are invalid');
  }
}

function verifyBundle(bundle, candidate, id, requireDistribution) {
  execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'pipe' });
  const info = plist(path.join(bundle, 'Info.plist'));
  const entitlements = decodePlist(execFileSync('codesign', ['-d', '--entitlements', ':-', bundle]));
  if (requireDistribution) {
    verifyIosBundleMetadata(info, entitlements, candidate, id);
    const profile = profileMetadata(execFileSync('security', ['cms', '-D', '-i', path.join(bundle, 'embedded.mobileprovision')]));
    if (profile.ProvisionedDevices || profile.ProvisionsAllDevices || profile.Entitlements?.['get-task-allow'] !== false ||
        profile.Entitlements?.['application-identifier'] !== `${TEAM}.${id}`) {
      throw new Error('Exported iPhone profile is not an App Store distribution profile');
    }
  } else if (info.CFBundleIdentifier !== id || info.CFBundleShortVersionString !== candidate.version ||
             info.CFBundleVersion !== candidate.buildNumber) throw new Error('Archived bundle version mismatch');
  const configPath = path.join(bundle, 'capacitor.config.json');
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (config.server?.url) throw new Error('Production iPhone package contains a development server URL');
  }
}

function verifyApp(app, candidate, distribution) {
  verifyBundle(app, candidate, APP_BUNDLE, distribution);
  verifyBundle(path.join(app, 'PlugIns/FolioleShareExtension.appex'), candidate, `${APP_BUNDLE}.share`, distribution);
}

export function verifyTestflightArchive(archive, candidate) {
  verifyApp(path.join(archive, 'Products/Applications/App.app'), candidate, false);
}

export function verifyTestflightIpa(ipa, directory, candidate) {
  execFileSync('unzip', ['-q', ipa, '-d', directory]);
  verifyApp(path.join(directory, 'Payload/App.app'), candidate, true);
}
