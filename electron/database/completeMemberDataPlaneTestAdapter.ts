import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

import { SYNC_DELIVERY_SCHEMA_STATEMENTS } from '../../lib/core/database/syncDeliverySchemaStatements.js';
import type {
  CompleteMemberBatch,
  CompleteMemberConformanceAdapter,
  CompleteMemberFact,
  CompleteMemberResource
} from '../../lib/core/sync/completeMemberDataPlaneConformance.js';

const TEST_SCHEMA = [
  `CREATE TABLE prepared_member_facts (
    policy_key TEXT NOT NULL, object_id TEXT NOT NULL, sequence INTEGER NOT NULL,
    payload TEXT, deleted_at TEXT, PRIMARY KEY (policy_key, object_id)
  )`,
  `CREATE TABLE prepared_member_resources (
    kind TEXT NOT NULL, resource_id TEXT NOT NULL, hash TEXT NOT NULL, bytes BLOB NOT NULL,
    PRIMARY KEY (kind, resource_id)
  )`,
  'CREATE TABLE prepared_private_state (key TEXT PRIMARY KEY)'
];

export class SqliteCompleteMemberTestAdapter implements CompleteMemberConformanceAdapter {
  private readonly db = new Database(':memory:');

  constructor(readonly host: 'android' | 'electron' | 'ios') {
    for (const statement of [...SYNC_DELIVERY_SCHEMA_STATEMENTS, ...TEST_SCHEMA]) this.db.exec(statement);
    this.db.exec(`CREATE TABLE sync_peer_cursors (
      peer_id TEXT NOT NULL, stream_name TEXT NOT NULL, cursor_value TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY (peer_id, stream_name)
    )`);
  }

  close() {
    this.db.close();
  }

  async seed(facts: CompleteMemberFact[], resources: CompleteMemberResource[], privateKeys: string[]) {
    const write = this.db.transaction(() => {
      const fact = this.db.prepare(`INSERT INTO prepared_member_facts
        (policy_key, object_id, sequence, payload, deleted_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(policy_key, object_id) DO UPDATE SET sequence = excluded.sequence,
          payload = excluded.payload, deleted_at = excluded.deleted_at`);
      for (const value of facts) fact.run(value.policyKey, value.id, value.sequence, value.payload, value.deletedAt);
      const resource = this.db.prepare(`INSERT OR REPLACE INTO prepared_member_resources
        (kind, resource_id, hash, bytes) VALUES (?, ?, ?, ?)`);
      for (const value of resources) resource.run(value.kind, value.id, value.hash, Buffer.from(value.bytes));
      const privateState = this.db.prepare('INSERT OR IGNORE INTO prepared_private_state (key) VALUES (?)');
      for (const key of privateKeys) privateState.run(key);
    });
    write();
  }

  async exportTo(peerId: string): Promise<CompleteMemberBatch> {
    const rows = this.db.prepare(`SELECT f.policy_key, f.object_id, f.sequence, f.payload, f.deleted_at
      FROM prepared_member_facts f WHERE NOT EXISTS (
        SELECT 1 FROM sync_delivery_receipts receipt
        WHERE receipt.peer_id = ? AND receipt.stream_name = 'prepared-member'
          AND receipt.operation_id = f.object_id || ':' || f.sequence
          AND receipt.status IN ('accepted', 'confirmed')
      ) ORDER BY f.sequence, f.policy_key`).all(peerId) as FactRow[];
    const resources = this.db.prepare(`SELECT kind, resource_id, hash, bytes
      FROM prepared_member_resources ORDER BY kind, resource_id`).all() as ResourceRow[];
    return {
      facts: rows.map(toFact),
      resources: resources.map((row) => ({
        bytes: new Uint8Array(row.bytes), hash: row.hash, id: row.resource_id, kind: row.kind
      })),
      toCursor: rows.at(-1)?.sequence ?? this.readCursor(peerId)
    };
  }

  async acknowledge(peerId: string, batch: CompleteMemberBatch) {
    const now = '2026-09-03T00:00:00.000Z';
    const write = this.db.prepare(`INSERT OR REPLACE INTO sync_delivery_receipts (
      peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
      local_position, status, remote_position, issue_reason, created_at, updated_at
    ) VALUES (?, 'prepared-member', ?, ?, ?, ?, ?, 'confirmed', ?, NULL, ?, ?)`);
    const transaction = this.db.transaction(() => {
      for (const fact of batch.facts) {
        write.run(peerId, `${fact.id}:${fact.sequence}`, fact.policyKey, fact.id,
          `${fact.payload ?? ''}:${fact.deletedAt ?? ''}`, String(fact.sequence),
          String(fact.sequence), now, now);
      }
    });
    transaction();
  }

  async accept(peerId: string, batch: CompleteMemberBatch) {
    assertResourceHashes(batch.resources);
    return this.db.transaction(() => {
      let applied = 0;
      const current = this.db.prepare(`SELECT sequence, payload, deleted_at FROM prepared_member_facts
        WHERE policy_key = ? AND object_id = ?`);
      const upsert = this.db.prepare(`INSERT INTO prepared_member_facts
        (policy_key, object_id, sequence, payload, deleted_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(policy_key, object_id) DO UPDATE SET sequence = excluded.sequence,
          payload = excluded.payload, deleted_at = excluded.deleted_at`);
      for (const fact of batch.facts) {
        const before = current.get(fact.policyKey, fact.id) as StoredFactRow | undefined;
        if (sameFact(before, fact)) continue;
        upsert.run(fact.policyKey, fact.id, fact.sequence, fact.payload, fact.deletedAt);
        applied += 1;
      }
      const resource = this.db.prepare(`INSERT OR REPLACE INTO prepared_member_resources
        (kind, resource_id, hash, bytes) VALUES (?, ?, ?, ?)`);
      for (const value of batch.resources) resource.run(value.kind, value.id, value.hash, Buffer.from(value.bytes));
      this.db.prepare(`INSERT OR REPLACE INTO sync_peer_cursors
        (peer_id, stream_name, cursor_value, updated_at) VALUES (?, 'prepared-member', ?, ?)`
      ).run(peerId, String(batch.toCursor), '2026-09-03T00:00:00.000Z');
      return applied;
    })();
  }

  async inspect() {
    const cursors = this.db.prepare(`SELECT peer_id, cursor_value FROM sync_peer_cursors
      WHERE stream_name = 'prepared-member'`).all() as Array<{ cursor_value: string; peer_id: string }>;
    const facts = this.db.prepare(`SELECT policy_key, object_id, sequence, payload, deleted_at
      FROM prepared_member_facts ORDER BY sequence, policy_key`).all() as FactRow[];
    const privateRows = this.db.prepare('SELECT key FROM prepared_private_state ORDER BY key').all() as Array<{ key: string }>;
    return {
      cursorByPeer: Object.fromEntries(cursors.map((row) => [row.peer_id, Number(row.cursor_value)])),
      facts: facts.map(toFact),
      privateKeys: privateRows.map(({ key }) => key)
    };
  }

  private readCursor(peerId: string) {
    const row = this.db.prepare(`SELECT cursor_value FROM sync_peer_cursors
      WHERE peer_id = ? AND stream_name = 'prepared-member'`).get(peerId) as { cursor_value: string } | undefined;
    return Number(row?.cursor_value ?? 0);
  }
}

interface FactRow { deleted_at: string | null; object_id: string; payload: string | null; policy_key: string; sequence: number }
interface ResourceRow { bytes: Buffer; hash: string; kind: string; resource_id: string }
interface StoredFactRow { deleted_at: string | null; payload: string | null; sequence: number }

function toFact(row: FactRow): CompleteMemberFact {
  return { deletedAt: row.deleted_at, id: row.object_id, payload: row.payload, policyKey: row.policy_key, sequence: row.sequence };
}

function sameFact(row: StoredFactRow | undefined, fact: CompleteMemberFact) {
  return row?.sequence === fact.sequence && row.payload === fact.payload && row.deleted_at === fact.deletedAt;
}

function assertResourceHashes(resources: CompleteMemberResource[]) {
  for (const resource of resources) {
    const actual = createHash('sha256').update(resource.bytes).digest('hex');
    if (actual !== resource.hash) throw new Error('complete_member_resource_integrity_failed');
  }
}
