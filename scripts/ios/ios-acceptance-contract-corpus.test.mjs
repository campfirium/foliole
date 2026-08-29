// @vitest-environment node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createIosSyncPackAcceptanceRoutes } from './ios-sync-pack-acceptance-routes.ts';
import { createIosSyncPackAcceptanceObservations } from './ios-sync-pack-acceptance-observations.ts';

const ROOT = 'scripts/ios/fixtures/acceptance-contract-corpus';
const RETIRED_BUILDERS = [
  'scripts/ios/generate-ios-acceptance-contract-corpus.ts',
  'scripts/ios/ios-content-resource-acceptance-fixture.ts',
  'scripts/ios/ios-database-upgrade-acceptance-fixture.ts',
  'scripts/ios/ios-state-writeback-acceptance-fixture.ts',
  'scripts/ios/ios-state-writeback-contract-inputs.ts',
  'scripts/ios/ios-sync-pack-acceptance-fixture.ts',
  'scripts/ios/ios-sync-pack-acceptance-mutations.ts',
  'scripts/ios/ios-sync-pack-contract-roundtrip-fixture.ts'
];
const SYNC_FORMAL_ROOTS = [
  'scripts/ios/ios-bootstrap-acceptance-attempt.mjs',
  'scripts/ios/ios-foreground-sync-lifecycle-runner.mjs',
  'scripts/ios/ios-sync-group-provider-fixture.ts'
];

describe('iOS formal acceptance contract corpus', () => {
  it('keeps every served byte version-controlled and hash-identified', () => {
    const identity = JSON.parse(fs.readFileSync(path.join(ROOT, 'corpus.json'), 'utf8'));
    expect(identity).toMatchObject({
      payload_schema_version: 78, peer_id: 'ios-acceptance-contract-peer', version: 2
    });
    expect(Object.keys(identity.files).sort()).toEqual([
      'content-resource-read/content-resource.syncpack',
      'state-writeback-runtime/confirmation-0.syncpack',
      'state-writeback-runtime/confirmation-1.syncpack',
      'sync-pack-runtime/corrupt-envelope.syncpack',
      'sync-pack-runtime/cursor-gap.syncpack',
      'sync-pack-runtime/illegal-dag.syncpack',
      'sync-pack-runtime/legacy-format.syncpack',
      'sync-pack-runtime/legal.syncpack',
      'sync-pack-runtime/successor.syncpack',
      'sync-pack-runtime/wrong-target.syncpack'
    ]);
    for (const [relativePath, expectedHash] of Object.entries(identity.files)) {
      const bytes = fs.readFileSync(path.join(ROOT, relativePath));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedHash);
    }
  });

  it('keeps formal sync scenarios outside retired database and desktop pack production', () => {
    for (const retired of RETIRED_BUILDERS) expect(fs.existsSync(retired), retired).toBe(false);
    const files = [...new Set(SYNC_FORMAL_ROOTS.flatMap(reachableImports))].sort();
    const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    expect(files).not.toContain('scripts/ios/ios-database-upgrade-contract-fixture.mjs');
    expect(source).not.toMatch(/better-sqlite3|syncPackBuilderFromDriver|companionLanSyncPushWithApply/);
    expect(source).not.toMatch(/ios-(?:sync-pack|state-writeback|content-resource)-acceptance-fixture/);
  });

  it('serves a pathname-normalized legal pack with an explicit byte length', async () => {
    const response = captureResponse();
    const routes = await createIosSyncPackAcceptanceRoutes({
      observations: createIosSyncPackAcceptanceObservations()
    });

    await expect(routes.handle({
      bodyText: '', method: 'GET', url: '/acceptance/sync-pack/legal?request=contract'
    }, response)).resolves.toBe(true);
    expect(response.headers).toMatchObject({ 'Content-Length': String(response.body.length) });
    expect(response.body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it('retains raw pushed version payloads for action-local failure evidence', async () => {
    const observations = createIosSyncPackAcceptanceObservations();
    const routes = await createIosSyncPackAcceptanceRoutes({ observations });
    const payloadJson = JSON.stringify({ version_id: 'ios-evidence-version' });
    const bodyText = JSON.stringify({ items: [{
      clientOpId: 'node:ios-evidence-version',
      identity: { objectId: 'ios-evidence-node', objectType: 'node', scope: 'workspace' },
      payloadJson
    }] });

    await expect(routes.handle({ bodyText, method: 'POST', url: '/companion/sync-push' }, captureResponse()))
      .resolves.toBe(true);
    expect(observations.pushed_payload_json).toEqual([payloadJson]);
  });

  it('keeps the versioned old database isolated to its independent upgrade entry', () => {
    const files = reachableImports('scripts/ios/ios-database-upgrade-acceptance-runner.mjs');
    expect(files).toContain('scripts/ios/ios-database-upgrade-contract-fixture.mjs');
    const importers = fs.readdirSync('scripts/ios')
      .filter((name) => /\.(?:mjs|ts)$/u.test(name) && !name.includes('.test.'))
      .filter((name) => fs.readFileSync(`scripts/ios/${name}`, 'utf8')
        .includes('./ios-database-upgrade-contract-fixture.mjs'));
    expect(importers).toEqual(['ios-database-upgrade-acceptance-runner.mjs']);
  });
});

function captureResponse() {
  return {
    body: Buffer.alloc(0),
    headers: {},
    end(body) { this.body = body; },
    writeHead(_status, headers) { this.headers = headers; }
  };
}

function reachableImports(entry) {
  const pending = [entry];
  const visited = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\()['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved) pending.push(resolved);
    }
  }
  return [...visited].sort();
}

function resolveImport(fromFile, specifier) {
  const candidate = path.normalize(path.join(path.dirname(fromFile), specifier));
  for (const file of [candidate, candidate.replace(/\.js$/, '.ts')]) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}
