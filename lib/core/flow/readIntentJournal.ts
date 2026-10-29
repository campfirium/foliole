import { z } from 'zod';

import type { DbPort } from '../sync/dbPort.js';

import { dailyFlowCommitSchema, type DailyFlowCommitArgs, type DailyFlowSettings } from './dailyFlowContract.js';

export const readIntentSchema = z.object({
  id: z.string().uuid(), libraryId: z.string().uuid(), nodeId: z.string().min(1), now: z.string().datetime(),
  dayKey: z.string(), mode: z.enum(['recommended', 'review-first', 'reading-only']),
  historyKey: z.string(), predecessor: z.string().uuid().nullable(),
  settings: z.object({ scope: z.string(), newDayStartsAtHour: z.number().int().min(0).max(23),
    pushQueue: z.object({ defaultPriority: z.number().int().min(1).max(9), priorityRatio: z.number().positive(),
      queueMixRatio: z.object({ reading: z.number().nonnegative(), fsrs: z.number().nonnegative() }),
      readingInitialIntervalMs: z.number().nonnegative(),
      readingIntervalGrowthFactorRange: z.object({ min: z.number().positive(), max: z.number().positive() }) }),
    dayWindow: z.object({ start: z.string().datetime(), end: z.string().datetime() }).optional()
  }).transform(value => value as DailyFlowSettings)
});
export type ReadIntent = z.infer<typeof readIntentSchema>;
export type ReadIntentRow = { ordinal: number; intent: ReadIntent; command: DailyFlowCommitArgs | null;
  entry: string | null; state: 'pending' | 'applied' | 'superseded'; error: string | null };

/** One independent SQLite journal. A committed INSERT is the admission boundary. */
export class ReadIntentJournal {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly db: DbPort, readonly libraryId: string) {}

  async initialize() {
    await this.db.run(`CREATE TABLE IF NOT EXISTS read_intents (
      ordinal INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, library_id TEXT NOT NULL,
      intent_json TEXT NOT NULL, command_json TEXT, entry_json TEXT,
      state TEXT NOT NULL DEFAULT 'pending', error TEXT)`);
  }

  private serial<T>(task: () => Promise<T>) {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }

  accept(intent: ReadIntent) {
    readIntentSchema.parse(intent);
    if (intent.libraryId !== this.libraryId) throw new Error('read_intent_library_changed');
    return this.serial(async () => {
      await this.db.run(`INSERT INTO read_intents(id,library_id,intent_json) VALUES(?,?,?)`,
        [intent.id, this.libraryId, JSON.stringify(intent)]);
    });
  }

  rows(pendingOnly = true): Promise<ReadIntentRow[]> {
    return this.serial(async () => {
      const rows = await this.db.query<{ ordinal: number; intent_json: string; command_json: string | null;
        entry_json: string | null; state: ReadIntentRow['state']; error: string | null }>(
        `SELECT * FROM read_intents WHERE library_id=? ${pendingOnly ? "AND state='pending'" : ''} ORDER BY ordinal`, [this.libraryId]);
      return rows.map(row => ({ ordinal: row.ordinal, intent: readIntentSchema.parse(JSON.parse(row.intent_json)),
        command: row.command_json ? dailyFlowCommitSchema.parse(JSON.parse(row.command_json)) : null,
        entry: row.entry_json, state: row.state, error: row.error }));
    });
  }

  prepare(id: string, command: DailyFlowCommitArgs, entry: string) {
    return this.serial(async () => {
      await this.db.run(`UPDATE read_intents SET command_json=?,entry_json=?
        WHERE id=? AND library_id=? AND command_json IS NULL AND state='pending'`,
      [JSON.stringify(command), entry, id, this.libraryId]);
    });
  }

  settle(id: string, state: ReadIntentRow['state'], error: string | null = null) {
    return this.serial(async () => {
      await this.db.run('UPDATE read_intents SET state=?,error=? WHERE id=? AND library_id=?',
        [state, error, id, this.libraryId]);
    });
  }
}
