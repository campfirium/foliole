// @vitest-environment node
import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('iOS bridge acceptance host contract', () => {
  it('keeps the receiver out of ordinary device and product builds', () => {
    const controller = fs.readFileSync('ios/App/App/FolioleBridgeViewController.swift', 'utf8');
    expect(controller).toContain('#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)');
    expect(controller).toContain('folioleBridgeAcceptance');
    expect(controller).not.toContain('registerPluginInstance(FolioleBridgeAcceptance');
  });

  it('uses an exclusive Web entry and existing pairing/workspace methods', () => {
    const entry = fs.readFileSync('src/companion/main.tsx', 'utf8');
    const scenario = fs.readFileSync('src/companion/iosBridgeAcceptance.ts', 'utf8');
    const contentResourceScenario = fs.readFileSync('src/companion/iosContentResourceAcceptance.ts', 'utf8');
    const databaseUpgradeScenario = fs.readFileSync('src/companion/iosDatabaseUpgradeAcceptance.ts', 'utf8');
    const syncPackScenario = fs.readFileSync('src/companion/iosSyncPackAcceptance.ts', 'utf8');
    const stateWritebackScenario = fs.readFileSync('src/companion/iosStateWritebackAcceptance.ts', 'utf8');
    expect(entry).toContain("VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE === '1'");
    expect(entry).toContain("iosAcceptanceScenario === 'sync-pack-runtime'");
    expect(entry).toContain("iosAcceptanceScenario === 'content-resource-read'");
    expect(entry).toContain("iosAcceptanceScenario === 'database-upgrade-runtime'");
    expect(entry).toContain("iosAcceptanceScenario === 'state-writeback-runtime'");
    expect(entry).toMatch(/if \(isIosBridgeAcceptance\)[\s\S]*else[\s\S]*<CompanionApp/);
    expect(scenario).toContain('loadCompanionBootstrapState()');
    expect(scenario).toContain('requestCompanionPairing({');
    expect(scenario).toContain('pairCompanionWithDesktop({');
    expect(scenario).toContain("saveCompanionWorkspaceSyncEndpoint('')");
    expect(syncPackScenario).toContain('applyCompanionDesktopSyncPack({');
    expect(syncPackScenario).toContain("pathWithQuery: LEGAL_PACK_PATH");
    expect(contentResourceScenario).toContain('pullMissingContentBlobs(endpoint)');
    expect(databaseUpgradeScenario).toContain("VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT === '1'");
    expect(databaseUpgradeScenario).toContain("VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_SCENARIO === 'database-upgrade-runtime'");
    expect(databaseUpgradeScenario).not.toContain('localStorage');
    expect(contentResourceScenario).toContain('pullMissingAttachmentResources(endpoint)');
    expect(contentResourceScenario).toContain('searchCompanionFullText(TOKENS.topic)');
    expect(contentResourceScenario).toContain('resolveRuntimeAttachmentResource(`asset://${IDS.valid}.pdf`)');
    expect(stateWritebackScenario).toContain('saveCompanionSyncNodeReadingRecord({');
    expect(stateWritebackScenario).toContain('saveCompanionSyncNodeReviewRecord({');
    expect(stateWritebackScenario).toContain('syncCompanionObjectsFromDesktop(endpoint, { includeResources: false })');
  });

  it('runs expected database upgrade failure without waiting for bootstrap ready', () => {
    const bootstrap = fs.readFileSync('scripts/ios/ios-bootstrap-acceptance.mjs', 'utf8');
    const runner = fs.readFileSync('scripts/ios/ios-database-upgrade-acceptance-runner.mjs', 'utf8');
    expect(bootstrap).toContain("scenario === 'database-upgrade-runtime'");
    expect(runner).toContain('launchAndRead(options, simulator.udid, resultPath, false)');
    expect(runner).toContain('installApp(options, simulator.udid, false)');
    expect(runner).not.toContain('waitForBootstrapSnapshot');
  });

  it('restores ordinary companion assets after compiling the acceptance app', () => {
    const runner = fs.readFileSync('scripts/ios/ios-bootstrap-acceptance.mjs', 'utf8');
    const databaseRunner = fs.readFileSync('scripts/ios/ios-database-upgrade-acceptance-runner.mjs', 'utf8');
    expect(runner).toMatch(
      /VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1'[\s\S]*try \{[\s\S]*xcodebuild[\s\S]*finally \{[\s\S]*android:web:build/
    );
    expect(databaseRunner).toContain('createOrdinaryBuildEnv(process.env)');
    expect(databaseRunner).toContain("'VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT'");
    expect(databaseRunner).toContain('assertSameContainer(options, simulator.udid, containerPath)');
  });

  it('reuses authoritative crypto/auth helpers without loading the Electron pairing store', () => {
    const service = fs.readFileSync('scripts/ios/ios-pairing-acceptance-service.ts', 'utf8');
    const auth = fs.readFileSync('electron/sync/companionRequestAuth.ts', 'utf8');
    expect(service).toContain("from '../../electron/sync/companionPairingEncryption.ts'");
    expect(service).toContain("from '../../electron/sync/companionRequestSignature.ts'");
    expect(service).not.toContain('companionPairingStore');
    expect(auth).toContain("from './companionRequestSignature.js'");
  });
});
