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
    const deviceIdentityScenario = fs.readFileSync('src/companion/iosDeviceIdentityAcceptance.ts', 'utf8');
    const syncPackScenario = fs.readFileSync('src/companion/iosSyncPackAcceptance.ts', 'utf8');
    const syncTriggerScenario = fs.readFileSync('src/companion/iosSyncTriggerAcceptance.ts', 'utf8');
    const syncGroupJoinScenario = fs.readFileSync('src/companion/iosSyncGroupJoinAcceptance.ts', 'utf8');
    const stateWritebackScenario = fs.readFileSync('src/companion/iosStateWritebackAcceptance.ts', 'utf8');
    expect(entry).toContain("VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE === '1'");
    expect(entry).toContain("iosAcceptanceScenario === 'sync-pack-runtime'");
    expect(entry).toContain("iosAcceptanceScenario === 'content-resource-read'");
    expect(entry).toContain("iosAcceptanceScenario === 'database-upgrade-runtime'");
    expect(entry).toContain("iosAcceptanceScenario === 'device-identity'");
    expect(entry).toContain("iosAcceptanceScenario === 'state-writeback-runtime'");
    expect(entry).toContain("iosAcceptanceScenario === 'sync-trigger-runtime'");
    expect(entry).toContain("iosAcceptanceScenario === 'sync-group-join-runtime'");
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
    expect(deviceIdentityScenario).toContain('loadCompanionBootstrapState()');
    expect(deviceIdentityScenario).not.toContain('localStorage');
    expect(contentResourceScenario).toContain('pullMissingAttachmentResources(endpoint)');
    expect(contentResourceScenario).toContain('searchCompanionFullText(TOKENS.topic)');
    expect(contentResourceScenario).toContain('resolveRuntimeAttachmentResource(`asset://${IDS.valid}.pdf`)');
    expect(stateWritebackScenario).toContain('saveCompanionSyncNodeReadingRecord({');
    expect(stateWritebackScenario).toContain('saveCompanionSyncNodeReviewRecord({');
    expect(stateWritebackScenario).toContain('syncCompanionObjectsFromDesktop(endpoint, { includeResources: false })');
    expect(syncTriggerScenario).toContain("beginNativeCompanionSyncRun('manual', runId)");
    expect(syncTriggerScenario).toContain("kind: 'run_finished'");
    expect(syncTriggerScenario).toContain('loadCompanionWorkspaceSyncState()');
    expect(syncGroupJoinScenario).toContain('FolioleSyncGroupJoinPrepare.receiveRequest');
    expect(syncGroupJoinScenario).toContain('loadCompanionBootstrapState()');
    expect(syncGroupJoinScenario).toContain('crypto.subtle.deriveKey');
    expect(syncGroupJoinScenario).toContain("scenario: 'sync-group-join-runtime'");
  });

  it('runs expected database upgrade failure without waiting for bootstrap ready', () => {
    const bootstrap = fs.readFileSync('scripts/ios/ios-bootstrap-acceptance.mjs', 'utf8');
    const standalone = fs.readFileSync('scripts/ios/ios-standalone-acceptance-runner.mjs', 'utf8');
    const runner = fs.readFileSync('scripts/ios/ios-database-upgrade-acceptance-runner.mjs', 'utf8');
    expect(bootstrap).toContain('runStandaloneIosAcceptanceScenario(scenario, REPO_ROOT, artifactRoot)');
    expect(bootstrap).toContain('runIosAcceptanceAttempts({');
    expect(standalone).toContain("scenario === 'database-upgrade-runtime'");
    expect(standalone).toContain('runIosDatabaseUpgradeAcceptance(repoRoot, artifactDir)');
    expect(standalone).toContain("scenario === 'device-identity'");
    expect(standalone).toContain('runIosDeviceAnchorAcceptance(repoRoot, artifactDir)');
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

  it('serves the fixed corpus without retired builders or desktop apply imports', () => {
    for (const retired of [
      'scripts/ios/generate-ios-acceptance-contract-corpus.ts',
      'scripts/ios/ios-content-resource-acceptance-fixture.ts',
      'scripts/ios/ios-database-upgrade-acceptance-fixture.ts',
      'scripts/ios/ios-state-writeback-acceptance-fixture.ts',
      'scripts/ios/ios-sync-pack-acceptance-fixture.ts'
    ]) expect(fs.existsSync(retired), retired).toBe(false);
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

  it('keeps node-version roundtrip identity in the product contract', () => {
    const companion = fs.readFileSync('src/companion/iosNodeVersionRoundtripAcceptance.ts', 'utf8');
    const contract = fs.readFileSync('lib/platform/iosSyncPackAcceptanceContract.ts', 'utf8');
    expect(companion).toContain('loadCompanionWorkspaceSyncState');
    expect(contract).toContain('IOS_SYNC_PACK_CAPTURE_OBJECT_ID');
    expect(contract).toContain('IOS_SYNC_PACK_RESTORE_VERSION_ID');
    expect(companion).not.toContain('function initialSnapshot');
  });
});
