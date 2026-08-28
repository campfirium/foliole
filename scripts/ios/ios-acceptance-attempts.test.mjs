// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runIosAcceptanceAttempts } from './ios-acceptance-attempts.mjs';
import {
  IosAcceptanceInfrastructureError,
  waitForIosBridgeResult
} from './ios-acceptance-infrastructure-error.mjs';
import { cleanupOwnedIosSimulator } from './ios-dedicated-simulator-runtime.mjs';

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-ios-attempts-'));
}

function writeOwner(artifactDir, udid) {
  fs.writeFileSync(path.join(artifactDir, 'simulator-owned.json'), JSON.stringify({ udid }));
}

describe('iOS acceptance attempt orchestration', () => {
  for (const kind of ['simulator-boot', 'app-launch', 'bridge-result-absent']) {
    it(`recovers exactly once from ${kind}`, async () => {
      const artifactRoot = temporaryRoot();
      try {
        const calls = [];
        await expect(runIosAcceptanceAttempts({
          artifactRoot,
          runAttempt: ({ artifactDir, attemptNumber }) => {
            calls.push(attemptNumber);
            writeOwner(artifactDir, `SIM-${attemptNumber}`);
            if (attemptNumber === 1) throw new IosAcceptanceInfrastructureError(kind, kind);
            return { status: 'passed' };
          }
        })).resolves.toEqual({ status: 'passed' });
        expect(calls).toEqual([1, 2]);
        expect(JSON.parse(fs.readFileSync(path.join(artifactRoot, 'summary.json'), 'utf8'))).toMatchObject({
          attemptCount: 2, firstFailureClassification: kind, status: 'passed',
          attempts: [{ udid: 'SIM-1' }, { udid: 'SIM-2' }]
        });
      } finally {
        fs.rmSync(artifactRoot, { force: true, recursive: true });
      }
    });
  }

  it.each([
    'build failed', 'install failed', 'signature mismatch', 'bootstrap readiness timed out',
    'lifecycle request timed out', 'bridge status failed', 'verifier failed'
  ])('does not recover from %s', async (message) => {
    const artifactRoot = temporaryRoot();
    try {
      const calls = [];
      await expect(runIosAcceptanceAttempts({
        artifactRoot,
        runAttempt: ({ artifactDir, attemptNumber }) => {
          calls.push(attemptNumber);
          writeOwner(artifactDir, `SIM-${attemptNumber}`);
          throw new Error(message);
        }
      })).rejects.toThrow(message);
      expect(calls).toEqual([1]);
    } finally {
      fs.rmSync(artifactRoot, { force: true, recursive: true });
    }
  });

  it('keeps the second infrastructure failure red', async () => {
    const artifactRoot = temporaryRoot();
    try {
      await expect(runIosAcceptanceAttempts({
        artifactRoot,
        runAttempt: ({ artifactDir, attemptNumber }) => {
          writeOwner(artifactDir, `SIM-${attemptNumber}`);
          throw new IosAcceptanceInfrastructureError('simulator-boot', `failure-${attemptNumber}`);
        }
      })).rejects.toThrow('failure-2');
      expect(JSON.parse(fs.readFileSync(path.join(artifactRoot, 'summary.json'), 'utf8')))
        .toMatchObject({ attemptCount: 2, status: 'failed' });
    } finally {
      fs.rmSync(artifactRoot, { force: true, recursive: true });
    }
  });

  it('rejects a recovery attempt that reuses the first UDID', async () => {
    const artifactRoot = temporaryRoot();
    try {
      await expect(runIosAcceptanceAttempts({
        artifactRoot,
        runAttempt: ({ artifactDir }) => {
          writeOwner(artifactDir, 'SIM-SAME');
          throw new IosAcceptanceInfrastructureError('app-launch', 'launch failed');
        }
      })).rejects.toThrow('reused the first Simulator UDID');
    } finally {
      fs.rmSync(artifactRoot, { force: true, recursive: true });
    }
  });

  it('classifies only a bridge timeout whose result file never appeared', async () => {
    const artifactRoot = temporaryRoot();
    const missing = path.join(artifactRoot, 'missing.json');
    const malformed = path.join(artifactRoot, 'malformed.json');
    fs.writeFileSync(malformed, '{');
    try {
      await expect(waitForIosBridgeResult({
        accept: () => false, describe: () => 'missing', initialObservation: 'missing',
        intervalMs: 1, label: 'bridge', resultPath: missing, timeoutMs: 3
      })).rejects.toMatchObject({ kind: 'bridge-result-absent' });
      await expect(waitForIosBridgeResult({
        accept: () => false, describe: () => 'malformed', initialObservation: 'malformed',
        intervalMs: 1, label: 'bridge', resultPath: malformed, timeoutMs: 3
      })).rejects.not.toBeInstanceOf(IosAcceptanceInfrastructureError);
    } finally {
      fs.rmSync(artifactRoot, { force: true, recursive: true });
    }
  });

  it('cleans up only the owned UDID in terminate, log, shutdown, delete order', () => {
    const artifactDir = temporaryRoot();
    const calls = [];
    try {
      writeOwner(artifactDir, 'OWNED');
      cleanupOwnedIosSimulator({
        artifactDir, bundleId: 'com.foliole.acceptance', udid: 'OWNED',
        captureLog: (args) => { calls.push(args); return 'log'; },
        runAllowFailure: (args) => calls.push(args)
      });
      expect(calls.map((args) => args.slice(0, 3))).toEqual([
        ['simctl', 'terminate', 'OWNED'], ['simctl', 'spawn', 'OWNED'],
        ['simctl', 'shutdown', 'OWNED'], ['simctl', 'delete', 'OWNED']
      ]);
      expect(fs.readFileSync(path.join(artifactDir, 'simulator.log'), 'utf8')).toBe('log');
    } finally {
      fs.rmSync(artifactDir, { force: true, recursive: true });
    }
  });

  it('preserves the device when the recorded ownership identity does not match', () => {
    const artifactDir = temporaryRoot();
    const calls = [];
    try {
      writeOwner(artifactDir, 'RECORDED');
      expect(() => cleanupOwnedIosSimulator({
        artifactDir, bundleId: 'com.foliole.acceptance', udid: 'OTHER',
        captureLog: () => 'log', runAllowFailure: (args) => calls.push(args)
      })).toThrow('does not match the recorded owned UDID');
      expect(calls).toEqual([]);
    } finally {
      fs.rmSync(artifactDir, { force: true, recursive: true });
    }
  });

  it('uploads only explicit small attempt evidence and excludes DerivedData', () => {
    const workflow = fs.readFileSync('.github/workflows/hosted-quality-ios.yml', 'utf8');
    const simulator = workflow.slice(workflow.indexOf('  simulator:'));
    for (const scenario of [
      'sync-group-signed-transport', 'content-resource-read', 'state-writeback-runtime',
      'sync-pack-runtime', 'foreground-sync-lifecycle'
    ]) {
      expect(simulator).toContain(`name: ios-simulator-${scenario}-`);
      expect(simulator).toContain(`.tmp/artifacts/ios-bridge-acceptance/${scenario}/summary.json`);
      expect(simulator).toContain(`.tmp/artifacts/ios-bridge-acceptance/${scenario}/attempt-*/simulator-owned.json`);
    }
    expect(simulator).toContain('include-hidden-files: true');
    expect(workflow).not.toMatch(/^\s+.*DerivedData.*$/mu);
  });

  it('prepares the Electron main DNS-SD host before Simulator acceptance', () => {
    const workflow = fs.readFileSync('.github/workflows/hosted-quality-ios.yml', 'utf8');
    const simulator = workflow.slice(workflow.indexOf('  simulator:'));
    const install = simulator.indexOf('node node_modules/electron/install.js');
    const rebuild = simulator.indexOf('npm run electron:rebuild:native');
    const acceptance = simulator.indexOf('node scripts/ios/ios-hosted-acceptance-bucket.mjs');
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(rebuild);
    expect(rebuild).toBeLessThan(acceptance);
  });
});
