import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS Sync Group host contract', () => {
  it('registers the native Sync Group provider, discovery, and signed transport bridge', () => {
    const controller = read('ios/App/App/FolioleBridgeViewController.swift');
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');

    expect(controller).toContain('registerPluginInstance(FolioleCompanionSyncPlugin())');
    expect(plugin).toContain('public let jsName = "FolioleCompanionSync"');
    for (const method of [
      'acceptSyncGroupJoinRequest', 'loadDiscoveryCandidates', 'loadSyncGroupProviderState',
      'rejectSyncGroupJoinRequest', 'signCompanionSyncRequest', 'startSyncGroupProvider',
      'stopSyncGroupProvider'
    ]) {
      expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
    }
    expect(plugin).not.toContain('PairingCredentials');
  });

  it('uses generated Sync Group keys and declares local-network privacy', () => {
    const contract = read('ios/App/App/FolioleCompanionContractStore.swift');
    const plist = read('ios/App/App/Info.plist');

    expect(contract).toContain('["syncGroupSecurity", "signature", "headerKeys"]');
    expect(contract).toContain('["hostApi", "syncGroupProvider"]');
    expect(contract).toContain('["hostApi", "network", "discoveryCandidateKeys"]');
    expect(plist).toContain('<key>NSLocalNetworkUsageDescription</key>');
    expect(plist).toContain('<string>_foliole-sync._tcp</string>');
    expect(plist).not.toContain('<key>NSAllowsArbitraryLoads</key>');
  });

  it('browses Bonjour with Network.framework and resolves services on the main queue', () => {
    const discovery = read('ios/App/App/FolioleCompanionBonjourDiscovery.swift');

    expect(discovery).toMatch(/DispatchQueue\.main\.async[\s\S]*startOnMainRunLoop\(\)/);
    expect(discovery).toMatch(
      /private func startOnMainRunLoop\(\)[\s\S]*NWBrowser\([\s\S]*\.bonjour\(type: "_foliole-sync\._tcp"[\s\S]*browser\.start\(queue: \.main\)/
    );
    expect(discovery).toContain('service.resolve(withTimeout: 3.0)');
  });

  it('keeps listening for same-group provider revisions after joining', () => {
    const provider = read('ios/App/App/FolioleCompanionSyncGroupProviderPlugin.swift');
    const plugin = read('ios/App/App/FolioleCompanionSyncPlugin.swift');

    expect(plugin).toContain('let serviceMonitor = FolioleCompanionBonjourServiceMonitor()');
    expect(provider).toContain('self.serviceMonitor.start(');
    expect(provider).toContain('self?.notifyListeners(hint.eventName, data: event)');
    expect(provider).toContain('txt["group_id"] == groupId');
    expect(provider).toContain('txt["runtime_instance_id"] != localRuntimeId');
    expect(provider).toContain('txt["facts_revision"]');
    expect(provider).toMatch(/stopSyncGroupProvider[\s\S]*serviceMonitor\.stop\(\)/);
  });
});
