// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSource = (name) => readFile(path.join(ROOT, 'ios/App/App', name), 'utf8');

describe('iOS sync-pack transfer contract', () => {
  it('owns ZIPFoundation directly without editing the managed Capacitor package', async () => {
    const project = await readFile(path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
    const managedPackage = await readFile(path.join(ROOT, 'ios/App/CapApp-SPM/Package.swift'), 'utf8');

    expect(project).toContain('XCRemoteSwiftPackageReference "ZIPFoundation"');
    expect(project).toContain('kind = exactVersion;');
    expect(project).toContain('version = 0.9.20;');
    expect(project).toContain('ZIPFoundation in Frameworks');
    expect(managedPackage).not.toContain('.package(url: "https://github.com/weichsel/ZIPFoundation');
  });

  it('registers the same transfer bridge and bundles generated contracts', async () => {
    const controller = await appSource('FolioleBridgeViewController.swift');
    const plugin = await appSource('FolioleCompanionSyncPackTransferPlugin.swift');
    const project = await readFile(path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');

    expect(controller).toContain('registerPluginInstance(FolioleCompanionSyncPackTransferPlugin())');
    expect(plugin).toContain('jsName = "FolioleCompanionSyncPackTransfer"');
    expect(plugin).toContain('CAPPluginMethod(name: "downloadDesktopSyncPack"');
    expect(plugin).toContain('CAPPluginMethod(name: "deleteDownloadedSyncPack"');
    expect(plugin).toContain('guard let headersObject = call.getObject(headersKey)');
    expect(plugin).not.toContain('call.getObject(headersKey) ?? [:]');
    expect(project).toContain('companion-sync-protocol-definitions.json in Resources');
    expect(project).toContain('companion-bridge-contract-definitions.json in Resources');
  });

  it('retains native download causes only in the isolated acceptance build', async () => {
    const plugin = await appSource('FolioleCompanionSyncPackTransferPlugin.swift');
    const routes = await readFile(path.join(ROOT, 'scripts/ios/ios-sync-pack-acceptance-routes.ts'), 'utf8');
    const transfer = await appSource('FolioleCompanionSyncPackTransfer.swift');

    expect(plugin).toContain('#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)');
    expect(plugin).toContain('item.userInfo[NSUnderlyingErrorKey] as? NSError');
    expect(plugin).toContain('#else\n        return error.localizedDescription');
    expect(routes).toContain("'Content-Length': String(routed.body.byteLength)");
    expect(transfer).toContain('data?.suffix(22)');
    expect(transfer).toContain('NSUnderlyingErrorKey: error');
  });

  it('validates pack SQLite, uses system zlib, and confines cache deletion', async () => {
    const database = await appSource('FolioleReadOnlySQLite.swift');
    const transfer = await appSource('FolioleCompanionSyncPackTransfer.swift');
    const validator = await appSource('FolioleCompanionSyncPackDatabaseValidator.swift');
    const zlib = await appSource('FolioleCompanionZlib.swift');

    expect(database).toContain('SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX');
    expect(validator).toContain('SELECT value FROM pack_manifest WHERE key = ?');
    expect(zlib).toContain('import zlib');
    expect(zlib).toContain('inflateInit_');
    expect(zlib).not.toContain('import Compression');
    expect(transfer).toContain('file.deletingLastPathComponent() == directory');
    expect(transfer).toContain('file.pathExtension == "db"');
  });
});
