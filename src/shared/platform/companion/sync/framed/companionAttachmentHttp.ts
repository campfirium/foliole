import { z } from 'zod';

import { attachmentMessage } from '../../../../../../lib/core/sync/requestSyncAttachmentContract.js';
import type { RequestSyncExchange } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncFilePort } from '../../../../../../lib/core/sync/requestSyncFiles.js';
import { prepareRequestSyncWire } from '../../../../../../lib/core/sync/requestSyncWire.js';

import { withCompanionRequestSyncHttpResponse, type CompanionRequestSyncHttpInput } from './companionRequestSyncHttp.js';

type Input = Omit<CompanionRequestSyncHttpInput, 'pathWithQuery' | 'body'> & { groupKey: Uint8Array };
const resultSchema = z.object({ offset: z.number().int().nonnegative(), blocks: z.number().int().min(0).max(64), pending: z.boolean() });

/** Native validates the authorized range and writes it; shared code verifies and publishes the file. */
export function companionReceiveAttachment(files: RequestSyncFilePort, input: Input): NonNullable<RequestSyncExchange['receiveAttachment']> {
  return async query => {
    const body = await prepareRequestSyncWire({ ...input, messages: async function* () { yield attachmentMessage(query); } });
    try {
      return await withCompanionRequestSyncHttpResponse(files, { ...input, body,
        pathWithQuery: '/companion/framed-sync?request=attachments', attachmentReceive: {
          max_blocks: query.maxBlocks, request_id_base64: btoa(String.fromCharCode(...query.requestId)),
          storage_key: query.storageKey, byte_length: query.byteLength, offset: query.offset,
          initiator_device_id: input.context.initiatorDeviceId, initiator_library_epoch: input.context.initiatorLibraryEpoch
        }
      }, async response => {
        const result = resultSchema.parse(response.attachment_receive);
        if (result.blocks > query.maxBlocks || result.offset !== Math.min(query.byteLength, query.offset + result.blocks * 512 * 1024)) {
          throw new Error('attachment_window_result_invalid');
        }
        return result;
      });
    } finally { await body.frames.return(undefined); }
  };
}
