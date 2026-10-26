import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowSession } from './dailyFlowSession.js';
import { dailyFlowSessionSchema } from './dailyFlowSessionSchema.js';

export type DailyFlowPosition = { node_id: string; queue_position: number | null; soon_position: number | null };

export async function readDailyFlow(db: DbPort) {
  const [row] = await db.query<{ day_key: string; revision: number; settings_key: string; mode: string;
    session_json: string; invalidated: number }>('SELECT * FROM daily_flow_state WHERE id = 1');
  if (!row) return null;
  const entries = await db.query<DailyFlowPosition>(
    'SELECT node_id, queue_position, soon_position FROM daily_flow_entries ORDER BY initial_position');
  const ordered = (key: 'queue_position' | 'soon_position') => entries.filter(value => value[key] !== null)
    .sort((a, b) => a[key]! - b[key]!).map(value => value.node_id);
  const session = dailyFlowSessionSchema.parse({ ...JSON.parse(row.session_json), queueNodeIds: ordered('queue_position'),
    soonNodeIds: ordered('soon_position'), daily: { scope: (JSON.parse(row.settings_key) as { scope?: string }).scope ?? '', dayKey: row.day_key, revision: row.revision } });
  return { ...row, session, entries, candidateIds: entries.map(entry => entry.node_id) };
}

export async function writeDailyFlow(db: DbPort, args: { dayKey: string; mode: string; settingsKey: string;
  now: string; revision: number; session: DailyFlowSession; candidateIds?: string[]; previousEntries?: DailyFlowPosition[] }) {
  const session = { ...args.session };
  delete session.daily;
  const queue = session.queueNodeIds;
  const soon = session.soonNodeIds ?? [];
  const metadata = { ...session, queueNodeIds: undefined, soonNodeIds: undefined };
  const ids = [...new Set([...(args.candidateIds ?? []), ...queue, ...soon])];
  await db.run(`INSERT OR IGNORE INTO daily_flow_entries (node_id, initial_position)
    SELECT value, CAST(key AS INTEGER) + (SELECT COALESCE(MAX(initial_position) + 1, 0) FROM daily_flow_entries)
    FROM json_each(?)`, [JSON.stringify(ids)]);
  const queuePositions = stablePositions(queue, args.previousEntries ?? [], 'queue_position');
  const soonPositions = stablePositions(soon, args.previousEntries ?? [], 'soon_position');
  const positions = [...new Set([...queue, ...soon])].map(id => ({ id,
    q: queuePositions.get(id) ?? null, s: soonPositions.get(id) ?? null }));
  await db.run(`WITH positions AS (SELECT json_extract(value, '$.id') AS id,
    json_extract(value, '$.q') AS q, json_extract(value, '$.s') AS s FROM json_each(?))
    UPDATE daily_flow_entries SET queue_position = (SELECT q FROM positions WHERE id = node_id),
      soon_position = (SELECT s FROM positions WHERE id = node_id)
    WHERE queue_position IS NOT (SELECT q FROM positions WHERE id = node_id)
      OR soon_position IS NOT (SELECT s FROM positions WHERE id = node_id)`, [JSON.stringify(positions)]);
  await db.run(`INSERT INTO daily_flow_state (id, day_key, revision, settings_key, mode, session_json, invalidated, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT(id) DO UPDATE SET day_key = excluded.day_key,
    revision = excluded.revision, settings_key = excluded.settings_key, mode = excluded.mode,
    session_json = excluded.session_json, invalidated = 0, updated_at = excluded.updated_at`,
  [args.dayKey, args.revision, args.settingsKey, args.mode, JSON.stringify(metadata), args.now]);
  return { ...session, daily: { scope: (JSON.parse(args.settingsKey) as { scope?: string }).scope ?? '', dayKey: args.dayKey, revision: args.revision } };
}

function stablePositions(ids: string[], previous: DailyFlowPosition[], key: 'queue_position' | 'soon_position') {
  const existing = new Map(previous.filter(row => row[key] !== null).map(row => [row.node_id, row[key]!]));
  const retained = ids.flatMap(id => existing.has(id) ? [existing.get(id)!] : []);
  let cursor = retained.length
    ? retained.reduce((minimum, value) => Math.min(minimum, value), retained[0]!) - ids.length - 1 : -1;
  const positions = ids.map(id => {
    cursor = existing.get(id) ?? cursor + 1;
    return cursor;
  });
  // Reordering may exhaust the integer gap; only that case needs fresh positions.
  const ordered = positions.every((value, index) => index === 0 || value > positions[index - 1]!);
  return new Map(ids.map((id, index) => [id, ordered ? positions[index]! : index]));
}

// An ordinary grade removes one ready entry; all other persisted positions stay intact.
export async function writeDailyFlowGrade(db: DbPort, stored: NonNullable<Awaited<ReturnType<typeof readDailyFlow>>>,
  session: DailyFlowSession, nodeId: string, now: string) {
  if (!session.queueNodeIds.includes(nodeId)) {
    await db.run('UPDATE daily_flow_entries SET queue_position = NULL WHERE node_id = ?', [nodeId]);
  }
  if (stored.session.soonNodeIds?.[0] === session.currentNodeId && !session.soonNodeIds?.includes(session.currentNodeId!)) {
    await db.run('UPDATE daily_flow_entries SET soon_position = NULL WHERE node_id = ?', [session.currentNodeId]);
  }
  const metadata = { ...session, daily: undefined, queueNodeIds: undefined, soonNodeIds: undefined };
  const revision = stored.revision + 1;
  await db.run(`UPDATE daily_flow_state SET revision = ?, session_json = ?, invalidated = 0, updated_at = ? WHERE id = 1`,
    [revision, JSON.stringify(metadata), now]);
  return { ...session, daily: { scope: (JSON.parse(stored.settings_key) as { scope?: string }).scope ?? '',
    dayKey: stored.day_key, revision } };
}

export async function writeDailyFlowReading(db: DbPort, stored: NonNullable<Awaited<ReturnType<typeof readDailyFlow>>>,
  session: DailyFlowSession, affectedIds: string[], now: string) {
  const queue = stablePositions(session.queueNodeIds, stored.entries, 'queue_position');
  const soon = stablePositions(session.soonNodeIds ?? [], stored.entries, 'soon_position');
  const previous = new Map(stored.entries.map(row => [row.node_id, row]));
  const ids = [...new Set([...affectedIds, ...stored.session.queueNodeIds, ...(stored.session.soonNodeIds ?? []),
    ...session.queueNodeIds, ...(session.soonNodeIds ?? [])])];
  const changes = ids.map(id => ({ id, q: queue.get(id) ?? null, s: soon.get(id) ?? null }))
    .filter(row => !previous.has(row.id) || previous.get(row.id)!.queue_position !== row.q ||
      previous.get(row.id)!.soon_position !== row.s);
  await db.run(`INSERT INTO daily_flow_entries (node_id, initial_position, queue_position, soon_position)
    SELECT json_extract(value, '$.id'), CAST(key AS INTEGER) +
      (SELECT COALESCE(MAX(initial_position) + 1, 0) FROM daily_flow_entries),
      json_extract(value, '$.q'), json_extract(value, '$.s') FROM json_each(?) WHERE true
    ON CONFLICT(node_id) DO UPDATE SET queue_position = excluded.queue_position, soon_position = excluded.soon_position`,
  [JSON.stringify(changes)]);
  const revision = stored.revision + 1;
  const metadata = { ...session, daily: undefined, queueNodeIds: undefined, soonNodeIds: undefined };
  await db.run('UPDATE daily_flow_state SET revision = ?, session_json = ?, invalidated = 0, updated_at = ? WHERE id = 1',
    [revision, JSON.stringify(metadata), now]);
  return { ...session, daily: { scope: (JSON.parse(stored.settings_key) as { scope?: string }).scope ?? '',
    dayKey: stored.day_key, revision } };
}
