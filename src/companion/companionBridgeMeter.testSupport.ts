import type { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';

// Count measured SQLite connection calls. A batch counts as one round trip.

export interface BridgeCall {
  method: string;
  sql: string[];
  callers?: string[];
  argBytes: number;
  rows: number;
  resultBytes: number;
}

let calls: BridgeCall[] | null = null;
let invoking = false;

export function startBridgeMeter() { calls = []; }
export function takeBridgeCalls() {
  const taken = calls ?? [];
  calls = null;
  return taken;
}

type Connection = ReturnType<typeof createFakeCapacitorConnection>;
const METHODS = ['open', 'close', 'isDBOpen', 'beginTransaction', 'commitTransaction', 'rollbackTransaction',
  'execute', 'executeSet', 'query', 'run'] as const;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? '');

function sqlOf(method: string, args: unknown[]) {
  if (method === 'executeSet') {
    return (args[0] as { statement: string }[]).map(entry => entry.statement);
  }
  if (method !== 'query' && method !== 'run' && method !== 'execute') return [];
  return [args[0] as string];
}

function callerFrames() {
  if (!process.env.FOLIOLE_ACTION_COST_REPORT_DIR) return {};
  return { callers: (new Error().stack ?? '').split('\n').filter(line => /\/(src|lib)\//u.test(line))
    .filter(line => !/companionBridgeMeter|companionSearchSnapshot|capacitorSqliteDbPort|sqlRecording|node_modules/u.test(line))
    .slice(0, 5).map(line => line.trim()) };
}

export function meterBridgeConnection(connection: Connection): Connection {
  const metered = { ...connection } as Record<string, unknown>;
  for (const method of METHODS) {
    const original = connection[method] as (...args: unknown[]) => Promise<unknown>;
    metered[method] = async (...args: unknown[]) => {
      // The fixture's readonly query delegates synchronously to a second wrapped fake connection.
      if (!calls || invoking) return original(...args);
      const call = { method, sql: sqlOf(method, args), ...callerFrames(), argBytes: bytes(args), rows: 0, resultBytes: 0 };
      calls.push(call);
      invoking = true;
      let pending: Promise<unknown>;
      try {
        pending = original(...args);
      } finally {
        invoking = false;
      }
      const result = await pending;
      call.rows = (result as { values?: unknown[] } | undefined)?.values?.length ?? 0;
      call.resultBytes = bytes(result);
      return result;
    };
  }
  return metered as Connection;
}
