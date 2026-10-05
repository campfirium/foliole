import type { DatabaseDriver } from '../database/driver.js';

import type { DbPort } from './dbPort.js';
import { hashText } from './syncNodeResolution.js';
import { describeVersionFact, parentFactKey, probeSyncPackFactPresence,
  type SyncParentFact, type SyncVersionFact } from './syncPackFactPresence.js';

export interface NodeVersionExchangeDependencies {
  sourceViewId: string;
  exchangeId: string;
  bodies: SyncVersionFact[];
  parents: SyncParentFact[];
}

const PREFIX = 'sync-exchange:';
const VERSION_SQL = `SELECT *, json_remove(snapshot_json, '$.content') AS snapshot_metadata
  FROM node_sync_versions WHERE version_id = ?`;
type StoredVersion = Parameters<typeof describeVersionFact>[0];

function exchangePrefix(sourceViewId: string, exchangeId?: string) {
  if (!sourceViewId || exchangeId === '') throw new Error('node_exchange_identity_invalid');
  return `${PREFIX}${hashText(sourceViewId)}:${exchangeId === undefined ? '' : `${hashText(exchangeId)}:`}`;
}

function holdStatements(args: NodeVersionExchangeDependencies) {
  const prefix = exchangePrefix(args.sourceViewId, args.exchangeId);
  return args.bodies.map((fact) => {
    if (fact.body_hash === null) throw new Error('node_exchange_body_unavailable');
    return { sql: `INSERT OR IGNORE INTO node_version_local_holds
      (hold_id, object_id, version_id, created_at) VALUES (?, ?, ?, ?)`,
    params: [prefix + hashText(JSON.stringify([fact.object_id, fact.version_id])),
      fact.object_id, fact.version_id, new Date().toISOString()] };
  });
}

function assertHeld(args: NodeVersionExchangeDependencies,
  claims: { versions: string[]; parents: string[] }) {
  if (args.bodies.some((row) => !claims.versions.includes(row.version_id)) ||
      args.parents.some((row) => !claims.parents.includes(parentFactKey(row)))) {
    throw new Error('node_exchange_dependency_unavailable');
  }
}

/** The caller selects necessary facts before reading content; failed sends keep these durable holds. */
export async function retainNodeVersionExchange(port: DbPort, args: NodeVersionExchangeDependencies) {
  await port.transaction(async (tx) => {
    const statements = holdStatements(args);
    const claims = await probeSyncPackFactPresence(tx,
      { versions: args.bodies, parents: args.parents, reviews: [] });
    assertHeld(args, claims);
    for (const statement of statements) await tx.run(statement.sql, statement.params);
  });
}

/** Synchronous adapter for desktop construction inside the caller's source transaction. */
export function retainNodeVersionExchangeWithDriver(driver: DatabaseDriver,
  args: NodeVersionExchangeDependencies) {
  driver.transaction((tx) => {
    const statements = holdStatements(args);
    const versions = args.bodies.flatMap((fact) => {
      const stored = tx.queryOne<StoredVersion>(VERSION_SQL, [fact.version_id]);
      if (!stored) return [];
      const local = describeVersionFact(stored);
      if (JSON.stringify({ ...local, parent_version_id: null }) !==
          JSON.stringify({ ...fact, parent_version_id: null })) {
        throw new Error(`sync_pack_node_version_immutable_mismatch:${fact.version_id}`);
      }
      return [fact.version_id];
    });
    const parents = args.parents.flatMap((edge) => tx.queryOne<SyncParentFact>(
      `SELECT * FROM node_sync_version_parents
        WHERE version_id = ? AND parent_version_id = ? AND ordinal = ?`,
      [edge.version_id, edge.parent_version_id, edge.ordinal]) ? [parentFactKey(edge)] : []);
    assertHeld(args, { versions, parents });
    for (const statement of statements) tx.execute(statement.sql, statement.params);
  });
}

export type NodeVersionExchangeRelease =
  | { sourceViewId: string; reason: 'confirmed'; exchangeId: string }
  | { sourceViewId: string; reason: 'view_invalidated' };

function releaseStatement(args: NodeVersionExchangeRelease) {
  if (args.reason === 'confirmed' && !args.exchangeId) throw new Error('node_exchange_confirmation_invalid');
  const prefix = exchangePrefix(args.sourceViewId, args.reason === 'confirmed' ? args.exchangeId : undefined);
  return { sql: 'DELETE FROM node_version_local_holds WHERE substr(hold_id, 1, ?) = ?',
    params: [prefix.length, prefix] };
}

/** Release only this exact exchange, or an explicitly invalidated source view. No timeout release. */
export async function releaseNodeVersionExchange(port: DbPort, args: NodeVersionExchangeRelease) {
  const statement = releaseStatement(args);
  await port.run(statement.sql, statement.params);
}

export function releaseNodeVersionExchangeWithDriver(driver: DatabaseDriver, args: NodeVersionExchangeRelease) {
  const statement = releaseStatement(args);
  driver.execute(statement.sql, statement.params);
}
