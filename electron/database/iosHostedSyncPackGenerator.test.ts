import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { loadIosAcceptanceContractCorpus } from '../../scripts/ios/ios-acceptance-contract-corpus.js';
import { readHostedPack } from '../../scripts/ios/ios-hosted-sync-pack-evidence.js';
import { createIosHostedSyncPackGenerator } from '../../scripts/ios/ios-hosted-sync-pack-generator.js';
import { createHostedPackTaskSource } from '../../scripts/ios/ios-hosted-sync-pack-task-source.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

afterEach(async () => {
  if (tempRoot) await fs.rm(tempRoot, { force: true, recursive: true });
});

it('builds identity-bound live packs through the production writer inside the attempt root', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-ios-hosted-writer-'));
  const generator = createIosHostedSyncPackGenerator({
    artifactRoot: tempRoot,
    providerDeviceId: 'provider-device',
    scenario: 'sync-pack-runtime'
  });
  const first = generator.prepare('accepted-device');
  const second = generator.prepare('accepted-device');
  expect(second).toBe(first);
  const packs = await first;

  const legal = readHostedPack(packs.legal);
  expect(legal.manifest).toMatchObject({
    from_peer_id: 'provider-device',
    from_state_seq: 0,
    to_peer_id: 'accepted-device',
    to_state_seq: 1
  });
  expect(readHostedPack(packs.wrongTarget).manifest.to_peer_id).toBe('accepted-device:wrong');
  expect(readHostedPack(packs.cursorGap).manifest).toMatchObject({
    from_state_seq: 7,
    to_peer_id: 'accepted-device',
    to_state_seq: 8
  });
  const evidence = JSON.parse(
    await fs.readFile(path.join(tempRoot, 'live-packs/evidence.json'), 'utf8')
  ) as { packs: Array<{
    row_counts: Record<string, number>;
    source_peer_id: string;
    target_peer_id: string;
  }> };
  expect(evidence.packs).toHaveLength(7);
  expect(evidence.packs.every((pack) => pack.row_counts.sync_groups === 0 &&
    pack.row_counts.sync_group_devices === 0)).toBe(true);
  expect(evidence.packs.every((pack) => pack.source_peer_id === 'provider-device')).toBe(true);
  expect(evidence.packs.filter((pack) => pack.target_peer_id !== 'accepted-device'))
    .toEqual([expect.objectContaining({ target_peer_id: 'accepted-device:wrong' })]);
  expect(readHostedPack(packs.cursorGap).manifest.tables)
    .toContainEqual({ name: 'sync_object_state', row_count: 1 });
  await expect(applyGeneratedPack(packs.stateInitial, 'state-initial')).resolves.toMatchObject({
    applied: true, toStateSeq: 1
  });
  await expect(applyGeneratedPack(packs.legal, 'legal')).resolves.toMatchObject({
    applied: true, toStateSeq: 1
  });
  await expect(generator.prepare('different-device')).rejects.toThrow('ios_hosted_second_accepted_identity');
});

async function applyGeneratedPack(packPath: string, name: string) {
  const incomingPath = path.join(tempRoot, `${name}.db`);
  await fs.writeFile(incomingPath, readHostedPack(packPath).database);
  const target = new BetterSqlite3(path.join(tempRoot, `${name}-target.db`));
  initializeDatabaseSchema(target);
  const port = createBetterSqliteDbPort(target, { name: `ios-hosted-${name}-reader` });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    return await applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0, hostName: 'accepted-device', sourceHostName: 'Acceptance Provider',
      sourcePeerId: 'provider-device'
    });
  } finally {
    await port.run('DETACH DATABASE inc');
    target.close();
  }
}

it('fails closed when the source would escape the attempt root', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-ios-hosted-writer-'));
  await expect(createHostedPackTaskSource({
    artifactRoot: tempRoot,
    oraclePackPath: loadIosAcceptanceContractCorpus().stateInitialPack,
    sourceName: '../../../escape'
  })).rejects.toThrow('ios_hosted_source_outside_attempt_root');
});
