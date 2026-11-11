import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { readFramedSyncStream } from './framedSyncBinaryStream.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';

export const WEB_DAV_REPAIR_SUFFIX = '.repair.bin';
export const repairDemandSchema = z.array(z.tuple([z.string().regex(/^[a-f0-9]{64}$/u), z.string().min(1)])).max(64);
export type RepairDemand = z.infer<typeof repairDemandSchema>;
export const repairRequestSchema = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/u), demand: repairDemandSchema, replace: z.boolean() });
export type RepairRequest = z.infer<typeof repairRequestSchema>;

type Auth = { scope: WebDavRelayBodyScope; groupKey: Uint8Array; signal?: AbortSignal | undefined };

function context(scope: WebDavRelayBodyScope, outgoing: boolean) {
  const peer = outgoing ? scope.send : scope.receive;
  const url = outgoing ? scope.outgoingDirection : scope.incoming;
  return { ...peer, groupId: JSON.stringify([peer.groupId, url.pathname, WEB_DAV_REPAIR_SUFFIX]) };
}

export function prepareWebDavRelayRepair(input: Auth, demand: RepairDemand, replace: boolean) {
  return prepareRequestSyncWire({ context: context(input.scope, true), groupKey: input.groupKey,
    ...(input.signal ? { signal: input.signal } : {}),
    async *messages() {
      const roundId = crypto.getRandomValues(new Uint8Array(16));
      for (const [hash, globalId] of demand) {
        yield { payloadCase: 'difference_request', payload: { objectType: 'node', globalId, roundId, facts: [], resources: [], blobHashes: [hexToBytes(hash)] } };
      }
      yield { payloadCase: 'request_attachment', payload: { operation: 'needs', state: 'end', requestId: roundId, pending: replace } };
    }
  });
}

export async function readWebDavRelayRepair(input: Auth, body: AsyncIterable<Uint8Array>) {
  const stream = await readFramedSyncStream(body);
  const demand: RepairDemand = [];
  let roundId: string | undefined;
  let replace: boolean | undefined;
  for await (const { message } of readRequestSyncWire({ ...stream, context: context(input.scope, false),
    groupKey: input.groupKey, ...(input.signal ? { signal: input.signal } : {}) })) {
    if (replace !== undefined) throw new Error('webdav_relay_repair_invalid');
    if (message.payloadCase === 'difference_request') {
      const payload = message.payload as { globalId: string; objectType: string; roundId: Uint8Array; blobHashes: Uint8Array[] };
      const current = bytesToHex(payload.roundId);
      roundId ??= current;
      if (current !== roundId || payload.objectType !== 'node' || payload.blobHashes.length !== 1 || demand.length >= 64) {
        throw new Error('webdav_relay_repair_invalid');
      }
      demand.push([bytesToHex(payload.blobHashes[0]!), payload.globalId]);
    } else {
      const payload = message.payload as { operation?: string; state?: string; requestId?: Uint8Array; pending?: boolean };
      if (message.payloadCase !== 'request_attachment' || payload.operation !== 'needs' || payload.state !== 'end' ||
          !payload.requestId || bytesToHex(payload.requestId) !== roundId) throw new Error('webdav_relay_repair_invalid');
      replace = payload.pending === true;
    }
  }
  if (replace === undefined || !roundId) throw new Error('webdav_relay_repair_invalid');
  return repairRequestSchema.parse({ id: roundId, demand, replace });
}
