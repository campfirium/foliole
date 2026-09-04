// @vitest-environment node
/* global process */

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertConfinedEvidencePath, assertLocalCandidateStillFrozen, createLocalDefinition
} from './macos/journey-readiness-mac-adapter.mjs';
import {
  assertOwnedSimulatorRemoved,
  createSignedSimulatorBuildArgs
} from './macos/journey-readiness-simulator-adapter.mjs';
import { resolveLocalQualificationScenario } from './macos/journey-readiness-local-qualification.mjs';
import { collectScriptTestFiles, selectScriptTestBucketFiles } from './script-test-bucket-selection.mjs';

describe('local journey readiness adapters', () => {
  it('confines evidence beneath the registered local artifact root', () => {
    const artifactDir = path.resolve('.tmp/artifacts/journey-readiness/confinement-test');
    mkdirSync(artifactDir, { recursive: true });
    try {
      expect(assertConfinedEvidencePath(process.cwd(), artifactDir)).toBeTruthy();
      expect(() => assertConfinedEvidencePath(process.cwd(), path.resolve('.tmp/artifacts')))
        .toThrow('must be a child');
    } finally {
      rmSync(artifactDir, { force: true, recursive: true });
    }
  });

  it('builds a locally signed Simulator app with the fixed iOS identity', () => {
    const args = createSignedSimulatorBuildArgs('/repo', '/cache/DerivedData', 'SIM-1');

    expect(args).toContain('platform=iOS Simulator,id=SIM-1');
    expect(args).toContain('PRODUCT_BUNDLE_IDENTIFIER=com.foliole.ios');
    expect(args).not.toContain('CODE_SIGNING_ALLOWED=NO');
    expect(args).toContain('/cache/DerivedData');
  });

  it('keeps business criteria and controller digests outside host qualification provenance', () => {
    const definition = createLocalDefinition({ candidate: {
      archiveDigest: 'a'.repeat(64), artifactDigest: 'b'.repeat(64), branch: 'dev',
      revision: 'c'.repeat(40), tree: 'd'.repeat(40)
    } });
    expect(definition).not.toHaveProperty('checks');
    expect(definition.action).not.toHaveProperty('scenario');
    expect(definition.source.archiveDigest).toHaveLength(64);
  });

  it('routes reviewed iOS runtime scenarios through the formal local qualification entry', () => {
    expect(resolveLocalQualificationScenario({})).toBeNull();
    expect(resolveLocalQualificationScenario({
      FOLIOLE_JOURNEY_READINESS_SCENARIO: 'device-identity'
    })).toBe('device-identity');
    expect(resolveLocalQualificationScenario({
      FOLIOLE_JOURNEY_READINESS_SCENARIO: 'sync-group-discovery-events'
    })).toBe('sync-group-discovery-events');
    expect(resolveLocalQualificationScenario({
      FOLIOLE_JOURNEY_READINESS_SCENARIO: 'sync-trigger-runtime'
    })).toBe('sync-trigger-runtime');
    expect(resolveLocalQualificationScenario({
      FOLIOLE_JOURNEY_READINESS_SCENARIO: 'sync-group-join-runtime'
    })).toBe('sync-group-join-runtime');
    expect(() => resolveLocalQualificationScenario({
      FOLIOLE_JOURNEY_READINESS_SCENARIO: 'unregistered'
    })).toThrow('Unsupported local qualification scenario');
  });

  it('rejects a source revision change during qualification', () => {
    expect(() => assertLocalCandidateStillFrozen({ branch: 'dev', revision: 'old', tree: 'tree' },
      process.cwd(), () => ({ branch: 'dev', revision: 'new', tree: 'tree' })))
      .toThrow('Local source changed during qualification');
  });

  it('proves exact owned Simulator deletion from the post-cleanup inventory', () => {
    expect(() => assertOwnedSimulatorRemoved({ devices: { ios: [{ udid: 'SIM-1' }] } }, 'SIM-1'))
      .toThrow('was not deleted');
    expect(assertOwnedSimulatorRemoved({ devices: { ios: [{ udid: 'OTHER' }] } }, 'SIM-1')).toBeUndefined();
  });

  it('keeps every readiness contract test in the continuous script core bucket', () => {
    const selected = selectScriptTestBucketFiles('core', collectScriptTestFiles());

    expect(selected).toEqual(expect.arrayContaining([
      'scripts/journey-readiness-contract.test.mjs',
      'scripts/journey-readiness-failures.test.mjs',
      'scripts/journey-readiness-macos.test.mjs'
    ]));
  });
});
