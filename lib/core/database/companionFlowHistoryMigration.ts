import { z } from 'zod';

import { dailyFlowSessionSchema } from '../flow/dailyFlowSessionSchema.js';
import { compactFlowHistoryEntry, restoreFlowHistoryEntry } from '../flow/flowHistoryEntry.js';
import type { DbPort } from '../sync/dbPort.js';

const context = z.object({ reviewSession: dailyFlowSessionSchema }).passthrough();
const sessions = z.object({ beforeContext: context.optional(), afterContext: context.optional(),
  beforeSession: dailyFlowSessionSchema.nullable().optional(),
  afterSession: dailyFlowSessionSchema.nullable().optional() }).passthrough();
const historySchema = z.object({ undoStack: z.array(sessions), redoStack: z.array(sessions) }).passthrough();
type HistoryEntry = z.infer<typeof sessions>;

function compact(entry: HistoryEntry) {
  const result = compactFlowHistoryEntry(entry);
  const source = entry.beforeContext?.reviewSession ?? entry.beforeSession;
  if (source && JSON.stringify(restoreFlowHistoryEntry(result, source)) !== JSON.stringify(entry)) {
    throw new Error('flow_history_conversion_changed');
  }
  return result;
}

async function convertStack(db: DbPort, key: string, stack: 'undoStack' | 'redoStack', count: number) {
  const converted: HistoryEntry[] = [];
  let top: HistoryEntry | undefined;
  for (let index = 0; index < count; index++) {
    const [row] = await db.query<{ entry: string }>(
      'SELECT json_extract(value, ?) AS entry FROM companion_meta WHERE key = ?', [`$.${stack}[${index}]`, key]);
    top = sessions.parse(JSON.parse(row!.entry));
    converted.push(compact(top));
  }
  return { converted, top };
}

/** A numbered upgrade only. Normal history reads never probe or convert legacy formats. */
export async function migrateCompanionFlowHistory(db: DbPort) {
  const records = await db.query<{ key: string; header: string; undo_type: string; redo_type: string;
    undo_count: number; redo_count: number }>(`SELECT key,
      json_remove(value, '$.undoStack', '$.redoStack') AS header,
      json_type(value, '$.undoStack') AS undo_type, json_type(value, '$.redoStack') AS redo_type,
      json_array_length(value, '$.undoStack') AS undo_count,
      json_array_length(value, '$.redoStack') AS redo_count
    FROM companion_meta WHERE substr(key, 1, 13) = 'flow_history:'`);
  const [daily] = await db.query('SELECT id FROM daily_flow_state WHERE id = 1');
  for (const record of records) {
    if (record.undo_type !== 'array' || record.redo_type !== 'array') throw new Error('flow_history_unavailable');
    const header = z.object({}).passthrough().parse(JSON.parse(record.header));
    const previous = historySchema.parse({ ...header, undoStack: [], redoStack: [] });
    // Materialize one legacy entry per bridge response, never the entire duplicated queue stack.
    const undo = await convertStack(db, record.key, 'undoStack', record.undo_count);
    const redo = await convertStack(db, record.key, 'redoStack', record.redo_count);
    const top = undo.top ?? redo.top;
    const resume = undo.top ? top?.afterContext?.reviewSession ?? top?.afterSession
      : top?.beforeContext?.reviewSession ?? top?.beforeSession;
    // Pre-daily libraries need one cursor to decode their first restored history, never one per step.
    // Daily libraries already own this cursor in daily_flow_entries.
    await db.run('UPDATE companion_meta SET value = ? WHERE key = ?', [JSON.stringify({ ...previous,
      undoStack: undo.converted, redoStack: redo.converted,
      ...(!daily && resume ? { resumeSession: resume } : {}) }), record.key]);
  }
}
