import type { DbPort } from '../sync/dbPort.js';

/**
 * Reading records converge by one key that depends only on the record: `(order, content_hash, deleted_at)`.
 * A live reading's order is the latest of its write time, handled time and history order; a deletion's
 * order is its write time. Every peer compares the same key, so arrival order cannot change the winner.
 */
export interface ReadingRecordOrderInput {
  deletedAt: string | null;
  historyOrderAt?: string | null;
  lastHandledAt?: string | null;
  updatedAt: string;
}

export function readingRecordOrderAt(record: ReadingRecordOrderInput) {
  if (record.deletedAt) return record.updatedAt;
  return latest(record.updatedAt, record.lastHandledAt, record.historyOrderAt);
}

export function readingRecordOrderKey(record: ReadingRecordOrderInput & { contentHash: string }) {
  return `${readingRecordOrderAt(record)}\n${record.contentHash}\n${record.deletedAt ?? ''}`;
}

/** The shared profile columns of `node_reading`; a write that leaves them all unchanged is not a new record. */
export interface ReadingProfileColumns {
  interval_duration_ms: number;
  interval_growth_factor: number;
  last_handled_at: string;
  next_at: string;
  priority: number;
  repetition_count: number;
  state: string;
}

/** What a writer knows about the reading it is about to replace. */
export interface CurrentReadingOrder {
  /** Order of the latest record this library has written or accepted; null when it has none. */
  orderAt: string | null;
  /** Handled time of the stored live reading; null when there is no live reading. */
  lastHandledAt: string | null;
  /** The stored live profile and its history order, when both exist. */
  stored?: { historyOrderAt: string; profile: ReadingProfileColumns } | null;
}

/**
 * The order a writer stamps on a new reading record (as its write time and, for a live reading, its
 * history order). It always comes after every record this library already holds, so a slow clock
 * cannot make a later act lose to an earlier one.
 *
 * Deliberate acts (anything that changes the handled time, undo or redo, creating, deleting) take the wall clock, so between two
 * devices that have not seen each other the later act wins. Edits that keep the handled time
 * (postponing, priority, maintenance) take the smallest step after the current record, so they never
 * override a concurrent act on another device: losing an edit is visible and cheap to redo, losing an
 * undo or a reading is not.
 */
export function nextReadingOrderAt(args: {
  current: CurrentReadingOrder;
  next: { lastHandledAt: string; profile?: ReadingProfileColumns } | null;
  now: string;
  restore?: boolean;
}) {
  const { current, next } = args;
  // Saving the same profile again (a reading position, a refresh) keeps the record it already has.
  if (next?.profile && current.stored && sameProfile(next.profile, current.stored.profile)) return current.stored.historyOrderAt;
  const after = current.orderAt ? plusOneMs(current.orderAt) : null;
  const act = args.restore === true || next === null || current.lastHandledAt === null
    || next.lastHandledAt !== current.lastHandledAt;
  if (act || after === null) return latest(args.now, next?.lastHandledAt, after);
  return latest(after, next.lastHandledAt);
}

/** Reads the stored record and reading row of one node; bind the node id once. */
export const CURRENT_READING_ORDER_SQL = `SELECT s.updated_at AS state_updated_at, s.deleted_at AS state_deleted_at,
    s.content_hash AS state_content_hash, r.last_handled_at, r.history_order_at, r.interval_duration_ms,
    r.interval_growth_factor, r.next_at, r.priority, r.repetition_count, r.state
  FROM (SELECT ? AS node_id) k
  LEFT JOIN sync_object_state s ON s.object_type = 'node_reading' AND s.object_id = k.node_id
  LEFT JOIN node_reading r ON r.node_id = k.node_id`;

export type CurrentReadingOrderRow = {
  history_order_at: string | null;
  interval_duration_ms: number | null;
  interval_growth_factor: number | null;
  last_handled_at: string | null;
  next_at: string | null;
  priority: number | null;
  repetition_count: number | null;
  state: string | null;
  state_content_hash: string | null;
  state_deleted_at: string | null;
  state_updated_at: string | null;
};

export function currentReadingOrder(row: CurrentReadingOrderRow | undefined): CurrentReadingOrder {
  if (!row) return { orderAt: null, lastHandledAt: null };
  const values = [row.state_updated_at, row.last_handled_at, row.history_order_at].filter((value): value is string => !!value);
  const live = row.last_handled_at !== null && row.history_order_at !== null && !row.state_deleted_at;
  return {
    orderAt: values.length ? latest(values[0]!, ...values.slice(1)) : null,
    lastHandledAt: row.last_handled_at,
    stored: live ? { historyOrderAt: row.history_order_at!, profile: {
      interval_duration_ms: Number(row.interval_duration_ms), interval_growth_factor: Number(row.interval_growth_factor),
      last_handled_at: row.last_handled_at!, next_at: String(row.next_at), priority: Number(row.priority),
      repetition_count: Number(row.repetition_count), state: String(row.state)
    } } : null
  };
}

function sameProfile(left: ReadingProfileColumns, right: ReadingProfileColumns) {
  return left.interval_duration_ms === right.interval_duration_ms && left.interval_growth_factor === right.interval_growth_factor
    && left.last_handled_at === right.last_handled_at && left.next_at === right.next_at && left.priority === right.priority
    && left.repetition_count === right.repetition_count && left.state === right.state;
}

/** `nextReadingOrderAt` against what an async library holds; call it before writing the node's reading. */
export async function nextReadingOrderAtWithDb(db: DbPort, args: {
  next: { lastHandledAt: string; profile?: ReadingProfileColumns } | null; nodeId: string; now: string; restore?: boolean;
}) {
  const [row] = await db.query<CurrentReadingOrderRow>(CURRENT_READING_ORDER_SQL, [args.nodeId]);
  return nextReadingOrderAt({ current: currentReadingOrder(row), next: args.next, now: args.now,
    ...(args.restore ? { restore: true } : {}) });
}

/** The comparison key of the record this library currently holds, or null when it holds none. */
export function storedReadingOrderKey(row: CurrentReadingOrderRow | undefined) {
  if (!row?.state_updated_at || row.state_content_hash === null) return null;
  return readingRecordOrderKey({ contentHash: row.state_content_hash, deletedAt: row.state_deleted_at,
    historyOrderAt: row.history_order_at, lastHandledAt: row.last_handled_at, updatedAt: row.state_updated_at });
}

function plusOneMs(value: string) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms + 1).toISOString() : null;
}

function latest(first: string, ...rest: Array<string | null | undefined>) {
  let result = first;
  for (const value of rest) if (value && value > result) result = value;
  return result;
}
