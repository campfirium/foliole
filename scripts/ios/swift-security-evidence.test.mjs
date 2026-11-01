import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SWIFT_LOCKS, swiftPins, compareSwiftResolution, swiftManifestEvidence,
  checkSwiftManifestCoverage, swiftHostNodes } from './swift-security-evidence.mjs';
import { collectSwiftSecurityInventory } from './swift-security-inventory.mjs';

const pin = { identity: 'example', kind: 'remoteSourceControl',
  location: 'https://github.com/vendor/example.git', state: { version: '1.0.0', revision: 'a'.repeat(40) } };
const lock = { version: 3, pins: [pin] };
const resolved = () => swiftPins(lock);
const temporary = [];
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('Swift evidence identities and coverage', () => {
  it('accepts both tracked lock formats without claiming advisory coverage', () => {
    expect(swiftPins({ ...lock, version: 2 })).toEqual(resolved());
    expect(compareSwiftResolution(resolved(), resolved())).toEqual([]);
  });
  it.each([{}, { version: 1, pins: [pin] }, { version: 3, pins: [] },
    { ...lock, pins: [pin, pin] }, { ...lock, pins: [{ ...pin, state: {} }] }])(
    'rejects incomplete, unsupported or duplicate lock inputs', input => {
      expect(() => swiftPins(input)).toThrow();
    });
  it.each(['version', 'revision', 'url'])('detects changed resolved %s', field => {
    expect(compareSwiftResolution(resolved(), [{ ...resolved()[0], [field]: 'different' }]))
      .toEqual([expect.objectContaining({ reason: 'lock-resolution-mismatch' })]);
  });
  it('keeps both missing pins and unpinned transitive dependencies visible', () => {
    const errors = compareSwiftResolution(resolved(), [{ ...resolved()[0], identity: 'other' }]);
    expect(errors.map(row => row.reason)).toEqual(['lock-resolution-mismatch', 'unlocked-remote-package']);
  });
  it('accounts for plugin edges and binary provenance through evaluated manifests', () => {
    const manifest = swiftManifestEvidence({ name: 'Plugin', dependencies: [{ sourceControl: [{
      identity: 'example', location: { remote: [{ urlString: pin.location }] },
      requirement: { range: [{ lowerBound: '1.0.0', upperBound: '2.0.0' }] }
    }] }, { fileSystem: [{ identity: 'local', path: '/local' }] }],
    targets: [{ name: 'Binary', type: 'binary', url: 'https://vendor/binary.zip', checksum: 'checksum' }]
    }, '/plugin/Package.swift');
    expect(manifest.edges.map(edge => edge.kind)).toEqual(['remote', 'local']);
    expect(manifest.binaries[0].checksum).toBe('checksum');
    expect(checkSwiftManifestCoverage(resolved(), [manifest])).toEqual([]);
    expect(checkSwiftManifestCoverage([], [manifest])[0].reason).toBe('manifest-remote-missing-from-lock');
  });
  it('rejects unknown manifest dependency types instead of ignoring them', () => {
    expect(() => swiftManifestEvidence({ name: 'Plugin', dependencies: [{ registry: [] }], targets: [] }, 'source'))
      .toThrow('Unsupported Swift dependency');
  });
  it('walks host transitive dependencies and reads checkout revisions', () => {
    const child = { identity: 'example', path: '/checkout', url: pin.location, version: '1.0.0', dependencies: [] };
    const tree = { identity: 'host', path: '/host', dependencies: [child, child] };
    expect(swiftHostNodes(tree, () => pin.state.revision)).toEqual(resolved());
    expect(() => swiftHostNodes({}, () => '')).toThrow();
  });
});

function fixture() {
  const parent = path.resolve('.tmp/artifacts/T674/swift-security/tests');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'inventory-'));
  temporary.push(root);
  for (const file of [...Object.values(SWIFT_LOCKS), 'package.json', '.npmrc', 'package-lock.json', 'ios/App/App.xcodeproj/project.pbxproj']) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), file.endsWith('resolved') ? JSON.stringify(lock) : '{}');
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
    '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture']);
  return root;
}

describe('Swift lock-only collection uses real files without native tools', () => {
  it('persists two separate hashed locks, candidate and explicitly incomplete coverage', () => {
    const root = fixture();
    const output = path.join(root, 'evidence');
    const report = collectSwiftSecurityInventory({ root, output });
    expect(report.status).toBe('lock-evidence');
    expect(report.errors).toEqual([]);
    expect(report.graphs.app.status).toBe('lock-evidence');
    expect(report.graphs.host.status).toBe('lock-evidence');
    expect(report.automatedAdvisories.status).toBe('unsupported');
    expect(report.officialReview.status).toBe('required');
    expect(report.overallStatus).toBe('incomplete');
    expect(report.inputs[SWIFT_LOCKS.app]).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(readFileSync(path.join(output, 'inventory.json'), 'utf8'))).toEqual(report);
  });
  it('persists a source failure instead of empty successful coverage', () => {
    const root = fixture();
    rmSync(path.join(root, SWIFT_LOCKS.host));
    const report = collectSwiftSecurityInventory({ root, output: path.join(root, 'evidence') });
    expect(report.status).toBe('error');
    expect(report.errors[0].reason).toBe('collection-failed');
    expect(report.overallStatus).toBe('incomplete');
  });
});
