import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { decodeFramedSyncFileJson, encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedFileBytes, framedFileDigest, framedFileUnsigned } from './framedSyncFileSchemas.js';
import type { FramedSyncSessionNoncePort } from './framedSyncSession.js';

const sessionSchema = z.object({ sessionId: framedFileBytes, contextId: framedFileDigest,
  noncePrefix: framedFileBytes, startingSequence: framedFileUnsigned,
  state: z.enum(['prepared', 'abandoned']) });

function sessionKey(sessionId: Uint8Array) {
  if (sessionId.length !== 16) throw new Error('framed_sync_session_id_invalid');
  return `sessions/${bytesToHex(sessionId)}.json`;
}

export function createFramedSyncFileSessionNoncePort(files: FramedSyncFilePort): FramedSyncSessionNoncePort {
  return {
    async persistBeforeEncryption(state) {
      const key = sessionKey(state.sessionId);
      return files.exclusive(key, async () => {
        const bytes = await files.read(key);
        if (bytes) {
          const prior = sessionSchema.parse(decodeFramedSyncFileJson(bytes));
          if (bytesToHex(prior.contextId) !== bytesToHex(state.contextId) ||
              bytesToHex(prior.noncePrefix) !== bytesToHex(state.noncePrefix) ||
              prior.startingSequence !== state.startingSequence) throw new Error('framed_sync_session_send_state_conflict');
          return 'identical' as const;
        }
        await files.write(key, encodeFramedSyncFileJson({ ...state, state: 'prepared' }));
        return 'created' as const;
      });
    },
    async abandon(sessionId) {
      const key = sessionKey(sessionId);
      await files.exclusive(key, async () => {
        const bytes = await files.read(key);
        if (!bytes) return;
        const prior = sessionSchema.parse(decodeFramedSyncFileJson(bytes));
        await files.write(key, encodeFramedSyncFileJson({ ...prior, state: 'abandoned' }));
      });
    }
  };
}
