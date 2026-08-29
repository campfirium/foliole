import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { buildDesktopSyncPackFromDriver } from '../../electron/database/syncPackBuilderFromDriver.js';

import { loadIosAcceptanceContractCorpus } from './ios-acceptance-contract-corpus.js';
import { packEvidence, readHostedPack } from './ios-hosted-sync-pack-evidence.js';
import {
  hostedPackSemanticDigest,
  hostedPackSemanticProjection
} from './ios-hosted-sync-pack-semantics.js';
import { createHostedPackTaskSource } from './ios-hosted-sync-pack-task-source.js';

const PREPARATION_TIMEOUT_MS = 30_000;
const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export interface IosHostedLivePacks {
  contentResource: string;
  cursorGap: string;
  legal: string;
  stateInitial: string;
  stateSteady: string;
  successor: string;
  wrongTarget: string;
}

export function createIosHostedSyncPackGenerator(args: {
  artifactRoot: string;
  providerDeviceId: string;
  scenario: string;
}) {
  let acceptedIdentity: string | null = null;
  let preparation: Promise<IosHostedLivePacks> | null = null;
  return {
    prepare(identity: string) {
      if (!identity) return Promise.reject(new Error('ios_hosted_accepted_identity_missing'));
      if (acceptedIdentity && acceptedIdentity !== identity) {
        return Promise.reject(new Error('ios_hosted_second_accepted_identity'));
      }
      acceptedIdentity = identity;
      preparation ??= bounded(generatePacks({ ...args, acceptedIdentity: identity }));
      return preparation;
    }
  };
}

async function generatePacks(args: {
  acceptedIdentity: string;
  artifactRoot: string;
  providerDeviceId: string;
  scenario: string;
}) {
  const corpus = loadIosAcceptanceContractCorpus();
  const root = path.join(args.artifactRoot, 'live-packs');
  await fs.mkdir(root, { recursive: true });
  const specs = packSpecs(corpus.syncPackDirectory, corpus.contentResourcePack,
    corpus.stateInitialPack, corpus.stateSteadyPack);
  const evidence = [];
  const result = {} as Record<keyof IosHostedLivePacks, string>;
  for (const spec of specs) {
    const source = await createHostedPackTaskSource({
      artifactRoot: args.artifactRoot,
      oraclePackPath: spec.oraclePath,
      sourceName: spec.name
    });
    try {
      const outputPath = path.join(root, `${spec.name}.syncpack`);
      await buildDesktopSyncPackFromDriver({
        createdAt: '2026-07-21T00:00:00.000Z',
        fromPeerId: args.providerDeviceId,
        fromStateSeq: source.fromStateSeq,
        outputPath,
        packId: source.packId,
        toPeerId: 'wrongTarget' in spec && spec.wrongTarget
          ? `${args.acceptedIdentity}:wrong`
          : args.acceptedIdentity,
        toStateSeq: source.toStateSeq
      }, source.driver);
      await assertWriterProjection(
        outputPath,
        source.oracleSemanticDigest,
        source.oracleSemanticProjection,
        source.sqlite
      );
      evidence.push(packEvidence({
        attempt: path.basename(args.artifactRoot),
        oracleSemanticDigest: source.oracleSemanticDigest,
        packPath: outputPath,
        scenario: args.scenario,
        sourceLocator: source.relativeLocator
      }));
      result[spec.name] = outputPath;
    } finally {
      source.close();
    }
  }
  await atomicWrite(path.join(root, 'evidence.json'), { packs: evidence, status: 'prepared' });
  return result as unknown as IosHostedLivePacks;
}

async function assertWriterProjection(
  packPath: string,
  oracleDigest: string,
  oracleProjection: ReturnType<typeof hostedPackSemanticProjection>,
  source: import('better-sqlite3').Database
) {
  const pack = readHostedPack(packPath);
  const groups = Object.fromEntries(pack.manifest.tables.map((row) => [row.name, row.row_count]));
  if (groups.sync_groups !== 0 || groups.sync_group_devices !== 0) {
    throw new Error('ios_hosted_live_pack_group_state_present');
  }
  const localState = source.prepare('SELECT COUNT(*) AS count FROM sync_group_local_state').get() as { count: number };
  if (!oracleDigest || localState.count !== 0) {
    throw new Error('ios_hosted_live_pack_projection_invalid');
  }
  const projectionPath = `${packPath}.semantic.db`;
  await fs.writeFile(projectionPath, pack.database, { flag: 'wx' });
  const projection = new BetterSqlite3(projectionPath, { readonly: true });
  try {
    if (hostedPackSemanticDigest(projection) !== oracleDigest) {
      const actual = hostedPackSemanticProjection(projection);
      const mismatches = actual.filter((entry, index) => (
        JSON.stringify(entry.rows) !== JSON.stringify(oracleProjection[index]?.rows)
      )).map((entry) => entry.table);
      throw new Error(`ios_hosted_live_pack_semantic_mismatch:${path.basename(packPath)}:${mismatches.join(',')}`);
    }
  } finally {
    projection.close();
    await fs.unlink(projectionPath);
  }
}

function packSpecs(syncRoot: string, content: string, stateInitial: string, stateSteady: string) {
  return [
    { name: 'contentResource', oraclePath: content },
    { name: 'stateInitial', oraclePath: stateInitial },
    { name: 'stateSteady', oraclePath: stateSteady },
    { name: 'legal', oraclePath: path.join(syncRoot, 'legal.syncpack') },
    { name: 'successor', oraclePath: path.join(syncRoot, 'successor.syncpack') },
    { name: 'wrongTarget', oraclePath: path.join(syncRoot, 'wrong-target.syncpack'), wrongTarget: true },
    { name: 'cursorGap', oraclePath: path.join(syncRoot, 'cursor-gap.syncpack') }
  ] as const;
}

function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('ios_hosted_sync_pack_preparation_timeout')), PREPARATION_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function atomicWrite(filePath: string, value: unknown) {
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(temporary, filePath);
}
