import { z } from 'zod';

import { ATTACHMENT_BLOCK_BYTES } from '../../../../../../lib/core/sync/attachmentBlockReceiver.js';
import { AttachmentReceivePaused } from '../../../../../../lib/core/sync/attachmentBlockTransfer.js';
import { attachmentDataYield } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { ATTACHMENT_BATCH_PULL_OPERATION, attachmentMessage } from '../../../../../../lib/core/sync/requestSyncAttachmentContract.js';
import type { AttachmentRequest } from '../../../../../../lib/core/sync/requestSyncAttachmentContract.js';
import type { RequestSyncExchange } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncFilePort } from '../../../../../../lib/core/sync/requestSyncFiles.js';
import { prepareRequestSyncWire } from '../../../../../../lib/core/sync/requestSyncWire.js';
import type { NativeAttachmentBatchMember } from '../../../../../../lib/platform/nativeRequestSyncHttpContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';

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

export function companionReceiveAttachmentBatch(files: RequestSyncFilePort, input: Input): NonNullable<RequestSyncExchange['receiveAttachmentBatch']> {
  return async (queries, consume) => {
    const shouldYield = attachmentDataYield();
    const body = await prepareRequestSyncWire({ ...input, messages: async function* () {
      for (const query of queries) yield attachmentMessage(query);
    } });
    try {
      await withCompanionRequestSyncHttpResponse(files, { ...input, body,
        pathWithQuery: `/companion/framed-sync?request=${ATTACHMENT_BATCH_PULL_OPERATION}`,
        attachmentBatchReceive: {
          initiator_device_id: input.context.initiatorDeviceId, initiator_library_epoch: input.context.initiatorLibraryEpoch,
          members: queries.map(query => ({
            max_blocks: query.maxBlocks, request_id_base64: btoa(String.fromCharCode(...query.requestId)),
            storage_key: query.storageKey, byte_length: query.byteLength, offset: query.offset
          }))
        }
      }, async (_response, owner) => {
        for (const [index, query] of queries.entries()) {
          if (!index) continue;
          await consume(index, async () => {
            input.signal?.throwIfAborted();
            if (shouldYield()) throw new AttachmentReceivePaused();
            const { attachment_batch_member: member } = await FolioleCompanionSync.readRequestSyncAttachmentBatch({
              library_key: owner.library_key, generation_id: owner.generation_id, request_id: owner.request_id
            });
            return validateBatchMember(query, index, member);
          });
        }
      }, async post => {
        let response: Awaited<ReturnType<typeof post>> | undefined;
        await consume(0, async () => {
          response = await post();
          return validateBatchMember(queries[0]!, 0, response.attachment_batch_member);
        });
        if (!response) throw new Error('attachment_batch_receiver_changed');
        return response;
      });
    } catch (error) {
      input.signal?.throwIfAborted();
      if (error && typeof error === 'object' && 'code' in error && error.code === 'E_ABORT') throw new AttachmentReceivePaused();
      throw error;
    } finally { await body.frames.return(undefined); }
  };
}

function validateBatchMember(query: AttachmentRequest, index: number, member: NativeAttachmentBatchMember | undefined) {
  const result = resultSchema.parse(member);
  if (member?.index !== index || result.blocks > query.maxBlocks ||
      result.offset !== Math.min(query.byteLength, query.offset + result.blocks * ATTACHMENT_BLOCK_BYTES) ||
      (result.offset === query.byteLength && result.pending)) throw new Error('attachment_batch_result_invalid');
  return result;
}
