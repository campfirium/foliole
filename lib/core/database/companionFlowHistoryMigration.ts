import { z } from 'zod';

import { dailyFlowSessionSchema } from '../flow/dailyFlowSessionSchema.js';
import { compactFlowHistoryEntry, restoreFlowHistoryEntry } from '../flow/flowHistoryEntry.js';
import type { DbPort } from '../sync/dbPort.js';

const context = z.object({ reviewSession: dailyFlowSessionSchema }).passthrough();
const sessions = z.object({ beforeContext: context.optional(), afterContext: context.optional(),
  beforeSession: dailyFlowSessionSchema.nullable().optional(),
  afterSession: dailyFlowSessionSchema.nullable().optional() }).passthrough();
const historySchema = z.object({ undoStack: z.array(sessions), redoStack: z.array(sessions) }).passthrough();

/** A numbered upgrade only. Normal history reads never probe or convert legacy formats. */
export async function migrateCompanionFlowHistory(db: DbPort) {
  const records = await db.query<{ key: string; value: string }>(
    "SELECT key, value FROM companion_meta WHERE substr(key, 1, 13) = 'flow_history:'");
  const [daily] = await db.query('SELECT id FROM daily_flow_state WHERE id = 1');
  for (const record of records) {
    const previous = historySchema.parse(JSON.parse(record.value));
    const compact = (entry: z.infer<typeof sessions>) => {
      const result = compactFlowHistoryEntry(entry);
      const source = entry.beforeContext?.reviewSession ?? entry.beforeSession;
      if (source && JSON.stringify(restoreFlowHistoryEntry(result, source)) !== JSON.stringify(entry)) {
        throw new Error('flow_history_conversion_changed');
      }
      return result;
    };
    const top = previous.undoStack.at(-1) ?? previous.redoStack.at(-1);
    const resume = previous.undoStack.length ? top?.afterContext?.reviewSession ?? top?.afterSession
      : top?.beforeContext?.reviewSession ?? top?.beforeSession;
    // Pre-daily libraries need one cursor to decode their first restored history, never one per step.
    // Daily libraries already own this cursor in daily_flow_entries.
    await db.run('UPDATE companion_meta SET value = ? WHERE key = ?', [JSON.stringify({ ...previous,
      undoStack: previous.undoStack.map(compact), redoStack: previous.redoStack.map(compact),
      ...(!daily && resume ? { resumeSession: resume } : {}) }), record.key]);
  }
}
