/* global process */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { cleanupOwnedIosSimulator, createOwnedIosSimulator } from '../ios/ios-dedicated-simulator-runtime.mjs';
import { verifyAcceptanceAppSignature } from '../ios/ios-simulator-acceptance-runner.mjs';

const BUNDLE_ID = 'com.foliole.ios';

export function createSignedSimulatorBuildArgs(repoRoot, derivedData, udid) {
  return [
    '-project', path.join(repoRoot, 'ios/App/App.xcodeproj'), '-scheme', 'App', '-configuration', 'Debug',
    '-destination', `platform=iOS Simulator,id=${udid}`,
    '-derivedDataPath', derivedData,
    `PRODUCT_BUNDLE_IDENTIFIER=${BUNDLE_ID}`, 'build'
  ];
}

export function assertOwnedSimulatorRemoved(payload, udid) {
  const present = Object.values(payload.devices ?? {}).flat().some((device) => device.udid === udid);
  if (present) throw new Error(`Owned Simulator was not deleted: ${udid}`);
}

function createRunner(repoRoot, commandLog) {
  const execute = (command, args, allowFailure = false) => {
    commandLog.push({ args, command });
    const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', timeout: 600_000 });
    if (!allowFailure && result.status !== 0) throw new Error(result.stderr || `${command} exited ${result.status}`);
    return `${result.stdout ?? ''}${allowFailure ? result.stderr ?? '' : ''}`;
  };
  return {
    capture: (command, args) => execute(command, args),
    captureAllowFailure: (command, args) => execute(command, args, true),
    run: (command, args) => { execute(command, args); },
    runAllowFailure: (command, args) => { execute(command, args, true); }
  };
}

export function createSimulatorProviders({ artifactDir, cleanupSource = () => {},
  derivedData, repoRoot }) {
  const commandLog = [];
  const runner = createRunner(repoRoot, commandLog);
  let owned = null;
  return {
    target: async () => {
      if (!(process.env.FOLIOLE_RESOURCE_GATE_HELD ?? '').split(',').includes('exclusive')) {
        throw new Error('exclusive resource gate is not held');
      }
      owned = createOwnedIosSimulator({
        artifactDir,
        create: (args) => runner.capture('xcrun', args),
        listAvailable: () => JSON.parse(runner.capture('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])),
        name: `Foliole Journey Readiness ${process.pid}`
      });
      runner.run('xcrun', ['simctl', 'boot', owned.udid]);
      runner.run('xcrun', ['simctl', 'bootstatus', owned.udid, '-b']);
      return { action: `owned Simulator ${owned.udid} booted`, status: 'passed' };
    },
    integrity: async () => {
      if (!owned) throw new Error('owned Simulator identity was not established');
      runner.run('xcodebuild', createSignedSimulatorBuildArgs(repoRoot, derivedData, owned.udid));
      const app = path.join(derivedData, 'Build/Products/Debug-iphonesimulator/App.app');
      runner.run('codesign', ['--verify', '--deep', '--strict', app]);
      const identifier = verifyAcceptanceAppSignature(
        runner.captureAllowFailure('codesign', ['-d', '--verbose=4', app]), BUNDLE_ID
      );
      runner.run('xcrun', ['simctl', 'install', owned.udid, app]);
      const container = runner.capture('xcrun', ['simctl', 'get_app_container', owned.udid, BUNDLE_ID, 'app']).trim();
      writeFileSync(path.join(artifactDir, 'simulator-installed.json'), `${JSON.stringify({ container, identifier, udid: owned.udid }, null, 2)}\n`);
      return { action: `signed app identity verified on owned Simulator ${owned.udid}`,
        status: 'passed' };
    },
    cleanup: async () => {
      try {
        if (!owned) throw new Error('owned Simulator identity was not established');
        cleanupOwnedIosSimulator({
          artifactDir, bundleId: BUNDLE_ID,
          captureLog: (args) => runner.captureAllowFailure('xcrun', args),
          runAllowFailure: (args) => runner.runAllowFailure('xcrun', args), udid: owned.udid
        });
        const after = JSON.parse(runner.capture('xcrun', ['simctl', 'list', 'devices', '--json']));
        assertOwnedSimulatorRemoved(after, owned.udid);
        writeFileSync(path.join(artifactDir, 'command-journal.json'), `${JSON.stringify(commandLog, null, 2)}\n`);
        const recorded = JSON.parse(readFileSync(path.join(artifactDir, 'simulator-owned.json'), 'utf8'));
        return { action: `owned Simulator ${recorded.udid} deleted exactly`, status: 'passed' };
      } finally { cleanupSource(); }
    }
  };
}
