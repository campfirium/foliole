import { ATTACHMENT_BLOCK_BYTES } from './attachmentBlockReceiver.js';
import { AttachmentReceivePaused } from './attachmentBlockTransfer.js';
import { describeAttachmentBatch, pullAttachmentBatch, type AttachmentBatchMemberResult } from './requestSyncAttachmentBatchClient.js';
import { ATTACHMENT_BATCH_MAX_BYTES, ATTACHMENT_BATCH_MAX_FILES, ATTACHMENT_BATCH_MEMBER_BYTES,
  attachmentRequestSchema, type AttachmentRequest } from './requestSyncAttachmentContract.js';
import { pullRequestSyncAttachmentWindows } from './requestSyncAttachmentPull.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import type { RequestSyncExchange } from './requestSyncDatabaseExchange.js';

type Outcome = { complete: boolean; blocks: number; verificationPending?: boolean };
type Stage = {
  host: RequestSyncAttachmentHost;
  exchange: RequestSyncExchange;
  failed: ReadonlySet<string>;
  pendingKeys: Set<string>;
  shouldYield(): boolean;
  attempt(key: string, execute: () => Promise<Outcome>): Promise<void>;
};

const deferred = { complete: false, blocks: 0 };

export async function runAttachmentBatchStage(stage: Stage, keys: readonly string[]) {
  const eligible = keys.filter(key => {
    if (!stage.failed.has(key)) return true;
    stage.pendingKeys.add(key);
    return false;
  });
  for (let index = 0; index < eligible.length; index += ATTACHMENT_BATCH_MAX_FILES) {
    if (stage.shouldYield()) {
      eligible.slice(index).forEach(key => stage.pendingKeys.add(key));
      break;
    }
    const group = eligible.slice(index, index + ATTACHMENT_BATCH_MAX_FILES);
    await describeAndPull(stage, group);
  }
}

async function describeAndPull(stage: Stage, keys: string[]) {
  let descriptions;
  try { descriptions = await describeAttachmentBatch(stage.exchange, keys); }
  catch (error) {
    for (const key of keys) await stage.attempt(key, async () => { throw error; });
    return;
  }
  let batch: AttachmentRequest[] = [], bytes = 0;
  for (const item of descriptions) {
    const pull = await prepareMember(stage, item);
    if (!pull) continue;
    const size = pull.byteLength - pull.offset;
    if (bytes + size > ATTACHMENT_BATCH_MAX_BYTES) {
      await transferMembers(stage, batch);
      batch = []; bytes = 0;
    }
    batch.push(pull);
    bytes += size;
  }
  if (batch.length) await transferMembers(stage, batch);
}

async function prepareMember(stage: Stage, item: AttachmentRequest) {
  const { storageKey, byteLength } = item;
  if (stage.shouldYield()) { stage.pendingKeys.add(storageKey); return; }
  let pull: AttachmentRequest | undefined;
  let outcome: (() => Promise<Outcome>) | undefined;
  try {
    if (item.state === 'end') {
      if (!item.pending) throw new Error('attachment_source_missing');
      outcome = async () => ({ ...deferred, verificationPending: true });
    } else {
      const resource = { storageKey, byteLength };
      const initial = await stage.host.status(resource);
      if (initial.kind === 'complete') outcome = async () => ({ complete: true, blocks: 0 });
      else if (byteLength > ATTACHMENT_BATCH_MEMBER_BYTES) {
        outcome = () => pullRequestSyncAttachmentWindows(stage.host, stage.exchange, storageKey, stage.shouldYield,
          { resource, initial, window: undefined });
      } else {
        pull = attachmentRequestSchema.parse({ ...resource, operation: 'pull', requestId: item.requestId,
          offset: initial.offset, maxBlocks: Math.ceil((byteLength - initial.offset) / ATTACHMENT_BLOCK_BYTES) });
      }
    }
  } catch (error) { outcome = async () => { throw error; }; }
  if (outcome) await stage.attempt(storageKey, outcome);
  return pull;
}

async function transferMembers(stage: Stage, batch: AttachmentRequest[]) {
  const results = new Map<string, AttachmentBatchMemberResult>();
  let failure: unknown;
  try {
    await pullAttachmentBatch(stage.exchange, stage.host, batch, stage.shouldYield,
      (request, result) => { results.set(request.storageKey, result); });
  } catch (error) { failure = error; }
  for (const request of batch) await stage.attempt(request.storageKey, async () => {
    const result = results.get(request.storageKey);
    if (!result) {
      if (failure && !(failure instanceof AttachmentReceivePaused)) throw failure;
      return deferred;
    }
    if (!result.complete && !result.pending && result.offset === request.offset) throw new Error('attachment_source_missing');
    return { complete: result.complete, blocks: Math.ceil((result.offset - request.offset) / ATTACHMENT_BLOCK_BYTES),
      verificationPending: result.pending && !stage.shouldYield() };
  });
}
