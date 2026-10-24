import { z } from 'zod';

import { ATTACHMENT_BLOCK_BYTES } from '../../../../../../lib/core/sync/attachmentBlockReceiver.js';
import { FRAMED_SYNC_FRAME_TYPES } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { decodeFramedSyncPreamble } from '../../../../../../lib/core/sync/framedSyncFraming.js';
import { decodeAndValidateProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { assertAuthenticatedSessionBootstrap } from '../../../../../../lib/core/sync/framedSyncSession.js';
import { ATTACHMENT_WINDOW_BLOCKS, attachmentMessage, attachmentRequestSchema } from '../../../../../../lib/core/sync/requestSyncAttachmentContract.js';
import type { RequestSyncExchange } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncFilePort } from '../../../../../../lib/core/sync/requestSyncFiles.js';
import { prepareRequestSyncWire } from '../../../../../../lib/core/sync/requestSyncWire.js';

import { decodeCompanionFileBytes } from './companionFileBytes.js';
import { withCompanionRequestSyncHttpResponse, type CompanionRequestSyncHttpInput } from './companionRequestSyncHttp.js';

const responseSchema = z.object({
  preamble_base64: z.string().max(256),
  messages: z.array(z.object({ metadata_base64: z.string().max(32768),
    file_key: z.string().max(128), byte_length: z.number().int().min(0).max(ATTACHMENT_BLOCK_BYTES)
  })).min(1).max(ATTACHMENT_WINDOW_BLOCKS + 1)
});

type Input = Omit<CompanionRequestSyncHttpInput, 'pathWithQuery' | 'body'> & { groupKey: Uint8Array };

/** Only bounded control metadata crosses the bridge; request cleanup owns the staged block files. */
export function companionPullAttachment(files: RequestSyncFilePort, input: Input): NonNullable<RequestSyncExchange['pullAttachment']> {
  return async (query, consume) => {
    const body = await prepareRequestSyncWire({ ...input, messages: async function* () { yield attachmentMessage(query); } });
    try {
      await withCompanionRequestSyncHttpResponse(files, { ...input, body,
        pathWithQuery: '/companion/framed-sync?request=attachments', attachmentResponse: {
          max_blocks: query.maxBlocks,
          initiator_device_id: input.context.initiatorDeviceId,
          initiator_library_epoch: input.context.initiatorLibraryEpoch
        }
      }, async (response, directory) => {
        const staged = responseSchema.parse(response.attachment_response);
        await assertAuthenticatedSessionBootstrap(input.context, decodeFramedSyncPreamble(decodeCompanionFileBytes(staged.preamble_base64)));
        for (const [index, item] of staged.messages.entries()) {
          input.signal?.throwIfAborted();
          const decoded = decodeAndValidateProtocolMessage(decodeCompanionFileBytes(item.metadata_base64), FRAMED_SYNC_FRAME_TYPES.sessionControl);
          if (decoded.payloadCase !== 'request_attachment') throw new Error('attachment_response_invalid');
          const message = attachmentRequestSchema.parse(decoded.payload);
          if (message.data.length || (message.state === 'block' ? item.file_key !== `${directory}/attachment-${index}` || !item.byte_length
            : item.file_key !== '' || item.byte_length !== 0)) throw new Error('attachment_response_file_invalid');
          await consume(message, item.file_key ? { key: item.file_key, byteLength: item.byte_length } : undefined);
        }
      });
    } finally { await body.frames.return(undefined); }
  };
}
