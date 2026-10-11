import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { decodeFramedSyncFileJson, encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedSyncPublicationDirectory, framedSyncPublicationKey, loadFramedSyncFileTask } from './framedSyncFilePublication.js';

const requestSchema = z.object({ memberId: z.string(), authorDeviceId: z.string() });
type TerminationInput = z.infer<typeof requestSchema> & { transferId: Uint8Array };

export function createFramedSyncFileTermination(files: FramedSyncFilePort) {
  return {
    async persistTerminationRequest(input: TerminationInput) {
      return files.exclusive(framedSyncPublicationDirectory(input.transferId), async () => {
        const task = await loadFramedSyncFileTask(files, input.transferId);
        if (!task || task.context.senderDeviceId !== input.authorDeviceId || task.context.receiverDeviceId !== input.memberId) {
          throw new Error('termination_request_identity_mismatch');
        }
        const key = `termination/${bytesToHex(input.transferId)}/request.json`;
        const prior = await files.read(key);
        if (prior) {
          const parsed = requestSchema.parse(decodeFramedSyncFileJson(prior));
          if (parsed.memberId !== input.memberId || parsed.authorDeviceId !== input.authorDeviceId) {
            throw new Error('termination_request_identity_conflict');
          }
          return 'identical' as const;
        }
        await files.write(key, encodeFramedSyncFileJson(input));
        return 'created' as const;
      });
    },
    async acknowledgeTermination(transferId: Uint8Array, memberId: string) {
      await files.exclusive(framedSyncPublicationDirectory(transferId), async () => {
        const key = `termination/${bytesToHex(transferId)}`;
        const data = await files.read(`${key}/request.json`);
        if (!data) throw new Error('termination_request_required');
        const request = requestSchema.parse(decodeFramedSyncFileJson(data));
        const task = await loadFramedSyncFileTask(files, transferId);
        if (!task || request.memberId !== memberId || task.context.receiverDeviceId !== memberId ||
            task.context.senderDeviceId !== request.authorDeviceId) throw new Error('termination_request_identity_mismatch');
        await files.write(`${key}/ack.json`, encodeFramedSyncFileJson({ transferId, memberId }));
        if (task.state === 'published') await files.write(framedSyncPublicationKey(transferId), encodeFramedSyncFileJson({
          ...task, state: 'confirmed', completedAt: Date.now()
        }));
      });
    }
  };
}
