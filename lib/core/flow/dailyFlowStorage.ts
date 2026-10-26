import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowSession } from './dailyFlowSession.js';
import { dailyFlowSessionSchema } from './dailyFlowSessionSchema.js';

export async function readDailyFlow(db: DbPort) {
  const [row] = await db.query<{ day_key: string; revision: number; settings_key: string; mode: string;
    session_json: string; invalidated: number }>('SELECT * FROM daily_flow_state WHERE id = 1');
  if (!row) return null;
  const entries = await db.query<{ node_id: string; queue_position: number | null; soon_position: number | null }>(
    'SELECT node_id, queue_position, soon_position FROM daily_flow_entries ORDER BY initial_position');
  const ordered = (key: 'queue_position' | 'soon_position') => entries.filter(value => value[key] !== null)
    .sort((a, b) => a[key]! - b[key]!).map(value => value.node_id);
  const session = dailyFlowSessionSchema.parse({ ...JSON.parse(row.session_json), queueNodeIds: ordered('queue_position'),
    soonNodeIds: ordered('soon_position'), daily: { scope: (JSON.parse(row.settings_key) as { scope?: string }).scope ?? '', dayKey: row.day_key, revision: row.revision } });
  return { ...row, session, candidateIds: entries.map(entry => entry.node_id) };
}

export async function writeDailyFlow(db: DbPort, args: { dayKey: string; mode: string; settingsKey: string;
  now: string; revision: number; session: DailyFlowSession; candidateIds?: string[] }) {
  const session = { ...args.session };
  delete session.daily;
  const queue = session.queueNodeIds;
  const soon = session.soonNodeIds ?? [];
  const metadata = { ...session, queueNodeIds: undefined, soonNodeIds: undefined };
  const ids = [...new Set([...(args.candidateIds ?? []), ...queue, ...soon])];
  await db.run(`INSERT OR IGNORE INTO daily_flow_entries (node_id, initial_position)
    SELECT value, CAST(key AS INTEGER) + (SELECT COALESCE(MAX(initial_position) + 1, 0) FROM daily_flow_entries)
    FROM json_each(?)`, [JSON.stringify(ids)]);
  const positions = [...new Set([...queue, ...soon])].map(id => ({ id,
    q: queue.includes(id) ? queue.indexOf(id) : null, s: soon.includes(id) ? soon.indexOf(id) : null }));
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
