import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type {
  FramedSyncSessionNoncePort,
  PersistedSessionSendState
} from '../../lib/core/sync/framedSyncSession.js';

type SessionSendRow = Readonly<{
  context_id: Uint8Array;
  nonce_prefix: Uint8Array;
  starting_sequence: string;
}>;

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

function bytes(value: unknown, field: string) {
  if (!(value instanceof Uint8Array)) throw new Error(`framed_sync_session_${field}_invalid`);
  return value;
}

function identical(row: SessionSendRow, state: PersistedSessionSendState) {
  return sameBytes(bytes(row.context_id, 'context_id'), state.contextId) &&
    sameBytes(bytes(row.nonce_prefix, 'nonce_prefix'), state.noncePrefix) &&
    row.starting_sequence === state.startingSequence.toString();
}

export function createDesktopFramedSyncSessionNoncePort(db: DbPort): FramedSyncSessionNoncePort {
  return {
    async persistBeforeEncryption(state) {
      return db.transaction(async (tx) => {
        const rows = await tx.query<SessionSendRow>(`SELECT context_id, nonce_prefix, starting_sequence
          FROM framed_sync_session_send_states WHERE session_id = ?`, [state.sessionId]);
        const prior = rows[0];
        if (prior) {
          if (!identical(prior, state)) throw new Error('framed_sync_session_send_state_conflict');
          return 'identical' as const;
        }
        await tx.run(`INSERT INTO framed_sync_session_send_states
          (session_id, context_id, nonce_prefix, starting_sequence, state)
          VALUES (?, ?, ?, ?, 'prepared')`, [state.sessionId, state.contextId,
          state.noncePrefix, state.startingSequence.toString()]);
        return 'created' as const;
      });
    },

    async abandon(sessionId) {
      await db.run(`UPDATE framed_sync_session_send_states SET state = 'abandoned'
        WHERE session_id = ?`, [sessionId]);
    }
  };
}
