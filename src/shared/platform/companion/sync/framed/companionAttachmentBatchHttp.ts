import { assertAttachmentBatchReceiveInput, type AttachmentBatchReceiveInput } from '../../../../../../lib/core/sync/attachmentBatchReceiveContract.js';
import { framedSyncPathWithIdentity } from '../../../../../../lib/core/sync/framedSyncHttpContract.js';
import { attachmentMessage } from '../../../../../../lib/core/sync/requestSyncAttachmentContract.js';
import { RequestSyncFiles, type RequestSyncFilePort } from '../../../../../../lib/core/sync/requestSyncFiles.js';
import { requestSyncPeerRoundPath, touchRequestSyncStream } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import { prepareRequestSyncWire } from '../../../../../../lib/core/sync/requestSyncWire.js';
import type { NativeAttachmentBatchIdentity } from '../../../../../../lib/platform/nativeAttachmentBatchContract.js';
import type { NativeRequestSyncHttpRequest } from '../../../../../../lib/platform/nativeRequestSyncHttpContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { spoolCompanionRequestSyncHttp, type CompanionRequestSyncHttpInput } from './companionRequestSyncHttp.js';

type Input = Omit<CompanionRequestSyncHttpInput, 'pathWithQuery' | 'body' | 'attachmentReceive'> & { groupKey: Uint8Array };
export interface PreparedCompanionAttachmentBatch {
  identity: NativeAttachmentBatchIdentity;
  plan: AttachmentBatchReceiveInput;
  temporary: RequestSyncFiles;
  hash: string;
  count: number;
}

/** One data operation, one prior scratch cleanup, and one preparation have separate lifetimes. */
export class CompanionAttachmentBatchHttp {
  private prepared: PreparedCompanionAttachmentBatch | undefined;
  private preparing = false;
  private active: PreparedCompanionAttachmentBatch | undefined;
  private cleanup: Promise<void> | undefined;
  private failure: { error: unknown } | undefined;
  private readonly exits = new WeakMap<PreparedCompanionAttachmentBatch, Promise<void>>();
  private readonly cleanups = new WeakMap<PreparedCompanionAttachmentBatch, Promise<void>>();

  constructor(private readonly files: RequestSyncFilePort, readonly input: Input) {}

  async prepare(plan: AttachmentBatchReceiveInput): Promise<PreparedCompanionAttachmentBatch> {
    assertAttachmentBatchReceiveInput(plan);
    this.check();
    if (this.prepared || this.preparing) throw new Error('attachment_batch_preparation_busy');
    this.preparing = true;
    const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
    const temporary = new RequestSyncFiles(this.files, `requests/${crypto.randomUUID()}`, this.input.signal);
    try {
      const body = await prepareRequestSyncWire({ ...this.input, messages: async function* () {
        for (const query of plan.queries) yield attachmentMessage(query);
      } });
      let prepared;
      try { prepared = await spoolCompanionRequestSyncHttp({ write: (key, bytes) => temporary.writeScratchFile(key, bytes) },
        temporary.directory, { ...body, frames: touchRequestSyncStream(body.frames, this.input.peerRound?.lease) }, this.input.signal); }
      finally { await body.frames.return(undefined); }
      this.check();
      if (prepared.count !== 1) throw new Error('attachment_batch_request_chunk_count');
      return this.prepared = { identity: { ...owner, operation_id: crypto.randomUUID() }, plan, temporary, ...prepared };
    } catch (error) { await temporary.close(); throw error; }
    finally { this.preparing = false; }
  }

  async discard(prepared: PreparedCompanionAttachmentBatch) {
    if (this.active === prepared) throw new Error('attachment_batch_data_running');
    if (this.prepared === prepared) this.prepared = undefined;
    await prepared.temporary.close();
  }

  async send(prepared: PreparedCompanionAttachmentBatch) {
    this.check();
    if (this.active || this.prepared !== prepared) throw new Error('attachment_batch_data_busy');
    this.requireOwner(prepared.identity);
    this.active = prepared; this.prepared = undefined;
    const path = framedSyncPathWithIdentity({ ...this.input.context,
      pathWithQuery: requestSyncPeerRoundPath('/companion/framed-sync?request=attachments', this.input.peerRound) });
    const signature = await FolioleCompanionSync.signCompanionSyncRequest({
      endpoint_url: this.input.endpointUrl, method: 'POST', nonce: crypto.randomUUID(), path_with_query: path,
      sync_group_id: this.input.context.groupId, timestamp: new Date().toISOString(), body_hash: prepared.hash
    });
    this.check(); this.requireOwner(prepared.identity);
    if (this.exits.has(prepared)) throw new Error('attachment_batch_stopped');
    const request: NativeRequestSyncHttpRequest = { library_key: prepared.identity.library_key, generation_id: prepared.identity.generation_id,
      request_id: prepared.identity.operation_id, directory: prepared.temporary.directory, request_chunk_count: prepared.count,
      url: new URL(path, this.input.endpointUrl).toString(), headers: { ...signature.headers,
        'x-foliole-body-sha256': prepared.hash, 'x-foliole-device-id': this.input.context.initiatorDeviceId,
        'x-foliole-library-epoch': this.input.context.initiatorLibraryEpoch },
      sync_group_id: this.input.context.groupId, receiver_device_id: this.input.context.responderDeviceId,
      receiver_library_epoch: this.input.context.responderLibraryEpoch, attachment_batch: { operation_id: prepared.identity.operation_id },
      ...(this.input.peerRound ? { peer_round_id: this.input.peerRound.id } : {}) };
    await FolioleCompanionSync.postRequestSyncHttp(request);
    if (this.input.peerRound) this.input.peerRound.admitted = true;
  }

  /** A retained native data result proves the socket and upload-file users have actually exited. */
  dataExited(prepared: PreparedCompanionAttachmentBatch): Promise<void> {
    const previous = this.exits.get(prepared);
    if (previous) return previous;
    const exit = this.admitCleanup(prepared);
    this.exits.set(prepared, exit);
    void exit.catch(() => undefined);
    return exit;
  }
  private async admitCleanup(prepared: PreparedCompanionAttachmentBatch) {
    if (this.cleanup) await this.cleanup.catch(() => undefined);
    const cleanup = prepared.temporary.close();
    this.cleanups.set(prepared, cleanup); this.cleanup = cleanup;
    void cleanup.then(() => { if (this.cleanup === cleanup) this.cleanup = undefined; }, error => {
      this.failure = { error }; if (this.cleanup === cleanup) this.cleanup = undefined;
    });
    if (this.active === prepared) this.active = undefined;
    if (this.prepared === prepared) this.prepared = undefined;
    if (this.failure) throw this.failure.error;
  }
  async cleaned(prepared: PreparedCompanionAttachmentBatch) {
    let failure: { error: unknown } | undefined;
    try { await this.dataExited(prepared); } catch (error) { failure = { error }; }
    try { await this.cleanups.get(prepared); } catch (error) { failure ??= { error }; }
    if (failure) throw failure.error;
  }
  private requireOwner(identity: NativeAttachmentBatchIdentity) {
    const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
    if (owner.library_key !== identity.library_key || owner.generation_id !== identity.generation_id) throw new Error('attachment_batch_owner_changed');
  }
  private check() { this.input.signal?.throwIfAborted(); if (this.failure) throw this.failure.error; }
}
