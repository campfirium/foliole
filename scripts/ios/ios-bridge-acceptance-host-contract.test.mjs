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
    const acceptancePairing = fs.readFileSync('src/companion/iosAcceptancePairing.ts', 'utf8');
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
    expect(scenario).toContain('pairIosAcceptanceCompanion(endpoint, hostName)');
    expect(acceptancePairing).toContain('requestCompanionPairing({');
    expect(acceptancePairing).toContain('pairCompanionWithDesktop({');
    expect(acceptancePairing).toContain("remotePeerName: ACCEPTANCE_DESKTOP_NAME");
    expect(scenario).toContain("saveCompanionWorkspaceSyncEndpoint('')");
    expect(syncPackScenario).toContain('applyCompanionDesktopSyncPack({');
    expect(syncPackScenario).toContain(
      "'apply', 'reapply', 'corrupt-envelope', 'wrong-target', 'cursor-gap', 'legacy-format', 'illegal-dag'"
    );
    expect(syncPackScenario).toContain('pathWithQuery: path');
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
    const standalone = fs.readFileSync('scripts/ios/ios-standalone-acceptance-runner.mjs', 'utf8');
    const runner = fs.readFileSync('scripts/ios/ios-database-upgrade-acceptance-runner.mjs', 'utf8');
    expect(bootstrap).toContain('runStandaloneIosAcceptanceScenario(scenario, REPO_ROOT, artifactRoot)');
    expect(bootstrap).toContain('runIosAcceptanceAttempts({');
    expect(standalone).toContain("scenario === 'database-upgrade-runtime'");
    expect(standalone).toContain('runIosDatabaseUpgradeAcceptance(repoRoot, artifactDir)');
    expect(runner).toContain('launchAndRead(options, simulator.udid, resultPath, false)');
    expect(runner).toContain('installApp(options, simulator.udid, false)');
    expect(runner).not.toContain('waitForBootstrapSnapshot');
  });

  it('restores ordinary companion assets after compiling the acceptance app', () => {
    const runner = fs.readFileSync('scripts/ios/ios-bootstrap-acceptance-attempt.mjs', 'utf8');
    const databaseRunner = fs.readFileSync('scripts/ios/ios-database-upgrade-acceptance-runner.mjs', 'utf8');
    expect(runner).toMatch(
      /VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE: '1'[\s\S]*try \{[\s\S]*xcodebuild[\s\S]*finally \{[\s\S]*android:web:build/
    );
    expect(databaseRunner).toContain('createOrdinaryBuildEnv(process.env)');
    expect(databaseRunner).toContain("'VITE_FOLIOLE_IOS_DATABASE_UPGRADE_FAULT'");
    expect(databaseRunner).toContain('resolveIosDatabaseUpgradeContractFixture(options.repoRoot)');
    expect(databaseRunner).not.toContain('ios-database-upgrade-acceptance-fixture.ts');
    expect(databaseRunner).toContain('resolvePreservedContainer(options, simulator.udid)');
    expect(databaseRunner).toContain('did not preserve the fixture');
  });

  it('finishes the first heavy build before booting a cold Simulator', () => {
    const runner = fs.readFileSync('scripts/ios/ios-bootstrap-acceptance-attempt.mjs', 'utf8');
    const databaseRunner = fs.readFileSync('scripts/ios/ios-database-upgrade-acceptance-runner.mjs', 'utf8');
    expect(runner).toMatch(/prepareApp\(options, owned\.udid[\s\S]*bootSimulator\(options, owned\.udid\)/);
    expect(databaseRunner).toMatch(/prepareBuild\(options, simulator\.udid, false\)[\s\S]*bootSimulator\(options\.repoRoot, simulator\)/);
  });

  it('reuses authoritative crypto/auth helpers without loading the Electron pairing store', () => {
    const service = fs.readFileSync('scripts/ios/ios-pairing-acceptance-service.ts', 'utf8');
    const auth = fs.readFileSync('electron/sync/companionRequestAuth.ts', 'utf8');
    expect(service).toContain("from '../../electron/sync/companionPairingEncryption.ts'");
    expect(service).toContain("from '../../electron/sync/companionRequestSignature.ts'");
    expect(service).not.toContain('companionPairingStore');
    expect(auth).toContain("from './companionRequestSignature.js'");
  });

  it('keeps deterministic corpus production independent from the Electron app runtime', () => {
    const builder = fs.readFileSync('electron/database/syncPackBuilderFromDriver.ts', 'utf8');
    const stateApply = fs.readFileSync('electron/database/companionSyncPushWithDbPort.ts', 'utf8');
    const stateObjectApply = fs.readFileSync('electron/database/companionSyncPushStateObjectWithDbPort.ts', 'utf8');
    const reviewLogApply = fs.readFileSync('electron/database/companionSyncPushReviewLogWithDbPort.ts', 'utf8');
    const nodeStateRows = fs.readFileSync('electron/database/nodeSyncStateRows.ts', 'utf8');
    const packRows = fs.readFileSync('electron/database/syncPackRows.ts', 'utf8');
    const syncObjects = fs.readFileSync('electron/database/syncObjectsFromDriver.ts', 'utf8');
    const syncPushHandler = fs.readFileSync('electron/sync/companionLanSyncPushWithApply.ts', 'utf8');
    const fixtures = [
      'scripts/ios/ios-content-resource-acceptance-fixture.ts',
      'scripts/ios/ios-state-writeback-acceptance-fixture.ts',
      'scripts/ios/ios-sync-pack-acceptance-fixture.ts'
    ].map((file) => fs.readFileSync(file, 'utf8'));
    expect(builder).not.toContain("from './connection.js'");
    expect(builder).not.toContain("from 'electron'");
    expect(nodeStateRows).not.toContain("from './connection.js'");
    expect(packRows).not.toContain("from './connection.js'");
    expect(syncObjects).not.toContain("from './connection.js'");
    for (const pureApply of [stateApply, stateObjectApply, reviewLogApply]) {
      expect(pureApply).not.toContain("from './connection.js'");
      expect(pureApply).not.toContain("from 'electron'");
    }
    expect(syncPushHandler).not.toContain('workspaceSyncAppliedEvents');
    expect(syncPushHandler).not.toContain("from 'electron'");
    for (const fixture of fixtures) {
      expect(fixture).toContain("from '../../electron/database/syncPackBuilderFromDriver.ts'");
      expect(fixture).not.toContain("from '../../electron/database/syncPackBuilder.ts'");
    }
  });

  it('serves the fixed corpus without runtime database, pack builder, or desktop apply imports', () => {
    const serviceFiles = [
      'scripts/ios/ios-pairing-acceptance-service.ts',
      'scripts/ios/ios-pairing-sync-scenario-service.ts',
      'scripts/ios/ios-state-writeback-acceptance-service.ts',
      'scripts/ios/ios-sync-pack-acceptance-routes.ts',
      'scripts/ios/ios-content-resource-acceptance-service.ts',
      'scripts/ios/ios-acceptance-contract-corpus.ts',
      'scripts/ios/ios-acceptance-mechanical-push.ts'
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    expect(serviceFiles).not.toMatch(/better-sqlite3|syncPackBuilderFromDriver|companionLanSyncPushWithApply/);
    expect(serviceFiles).not.toMatch(/ios-(?:sync-pack|state-writeback|content-resource)-acceptance-fixture/);
  });

  it('uses the canonical Inbox identity for node-version roundtrip acceptance', () => {
    const companion = fs.readFileSync('src/companion/iosNodeVersionRoundtripAcceptance.ts', 'utf8');
    const fixture = fs.readFileSync('scripts/ios/ios-sync-pack-acceptance-fixture.ts', 'utf8');
    expect(companion).toContain("import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds';");
    expect(fixture).toContain("import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.ts';");
    expect(companion).not.toContain("const INBOX_NODE_ID = 'inbox'");
    expect(fixture).not.toContain("const INBOX_NODE_ID = 'inbox'");
  });
});
