import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS pairing host contract', () => {
  it('registers the same native pairing bridge without exposing the secret in loaded state', () => {
    const controller = read('ios/App/App/FolioleBridgeViewController.swift');
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');
    const store = read('ios/App/App/FolioleCompanionPairingStore.swift');

    expect(controller).toContain('registerPluginInstance(FolioleCompanionSyncPlugin())');
    expect(plugin).toContain('public let jsName = "FolioleCompanionSync"');
    for (const method of [
      'clearPairingCredentials', 'desktopHttpRequest', 'loadDiscoveryCandidates', 'loadPairingState',
      'savePairingCredentials', 'savePrimaryDeviceId', 'signCompanionSyncRequest'
    ]) {
      expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
    }
    expect(plugin).toMatch(
      /@objc func savePrimaryDeviceId[\s\S]*store\.savePrimaryDeviceId\([\s\S]*requiredString\([\s\S]*"primaryDeviceId"\)/
    );
    expect(store).not.toMatch(/stateKey\("deviceSecret"\)/);
  });

  it('keeps the pairing secret in Keychain and declares local-network privacy', () => {
    const keychain = read('ios/App/App/FolioleCompanionPairingSecretStore.swift');
    const plist = read('ios/App/App/Info.plist');

    expect(keychain).toContain('kSecClassGenericPassword');
    expect(keychain).toContain('kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly');
    expect(plist).toContain('<key>NSLocalNetworkUsageDescription</key>');
    expect(plist).toContain('<string>_foliole-sync._tcp</string>');
    expect(plist).not.toContain('<key>NSAllowsArbitraryLoads</key>');
  });

  it('uses generated bridge keys for pairing, discovery and request signing', () => {
    const contract = read('ios/App/App/FolioleCompanionContractStore.swift');
    const discovery = read('ios/App/App/FolioleCompanionBonjourDiscovery.swift');

    expect(contract).toContain('["pairingPlugin", "credentialRequestKeys"]');
    expect(contract).toContain('["pairingPlugin", "signature", "headerKeys"]');
    expect(contract).toContain('["hostApi", "network", "discoveryCandidateKeys"]');
    expect(discovery).toContain('contract.discoveryCandidateKeys[name]');
  });

  it('browses Bonjour with Network.framework and resolves services on the main queue', () => {
    const discovery = read('ios/App/App/FolioleCompanionBonjourDiscovery.swift');

    expect(discovery).toMatch(/DispatchQueue\.main\.async[\s\S]*startOnMainRunLoop\(\)/);
    expect(discovery).toMatch(
      /private func startOnMainRunLoop\(\)[\s\S]*NWBrowser\([\s\S]*\.bonjour\(type: "_foliole-sync\._tcp"[\s\S]*browser\.start\(queue: \.main\)/
    );
    expect(discovery).toContain('service.resolve(withTimeout: 3.0)');
  });
});
