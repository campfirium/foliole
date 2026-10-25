import type { PluginListenerHandle } from '@capacitor/core';

import type { AttachmentBatchDataResult, AttachmentBatchReceiveOperation } from '../../../../../../lib/core/sync/attachmentBatchReceiveContract.js';
import { AttachmentReceivePaused } from '../../../../../../lib/core/sync/attachmentBlockTransfer.js';
import { onAttachmentWorkYield } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';

import { attachmentBatchDeferred, attachmentBatchMetadata } from './companionAttachmentBatchCalls.js';
import { CompanionAttachmentBatchFile, type CompanionAttachmentBatchFileHost } from './companionAttachmentBatchFile.js';
import type { CompanionAttachmentBatchHttp, PreparedCompanionAttachmentBatch } from './companionAttachmentBatchHttp.js';
import { companionAttachmentBatchResult, parseCompanionAttachmentBatchSnapshot } from './companionAttachmentBatchSchema.js';

export class CompanionAttachmentBatchOperation implements CompanionAttachmentBatchFileHost {
  readonly identity;
  readonly terminalState = attachmentBatchDeferred<never>();
  readonly actual = attachmentBatchDeferred<void>();
  readonly terminal = this.terminalState.promise;
  readonly actualExit = this.actual.promise;
  private readonly result = attachmentBatchDeferred<AttachmentBatchDataResult>();
  private readonly records = new Map<number, CompanionAttachmentBatchFile>();
  private listener: PluginListenerHandle | undefined;
  private reading: Promise<void> | undefined;
  private dirty = false;
  private revision = 0;
  private closed = false;
  private failure: { error: unknown } | undefined;
  private dataHandled = false;
  private paused = false;
  private stopYield = () => {};
  private stopping: Promise<void> | undefined;

  constructor(private readonly http: CompanionAttachmentBatchHttp, private readonly prepared: PreparedCompanionAttachmentBatch) {
    this.identity = prepared.identity;
  }
  async open(): Promise<AttachmentBatchReceiveOperation> {
    const signal = this.http.input.signal;
    const cancel = () => { void this.stop().catch(error => this.fail(error)); };
    let attempted = false;
    try {
      this.listener = await FolioleCompanionSync.addListener('attachmentBatchChanged', event => {
        if (event.library_key === this.identity.library_key && event.generation_id === this.identity.generation_id && event.operation_id === this.identity.operation_id) this.wake();
      });
      signal?.addEventListener('abort', cancel, { once: true });
      this.stopYield = onAttachmentWorkYield(() => { this.paused = true; cancel(); });
      this.check();
      attempted = true;
      const { context } = this.http.input;
      this.accept(await attachmentBatchMetadata({ ...this.identity, action: 'open',
        request_id_base64: btoa(String.fromCharCode(...this.prepared.plan.queries[0]!.requestId)),
        entries: this.prepared.plan.entries.map(entry => ({ storage_key: entry.storageKey, byte_length: entry.byteLength,
          offset: entry.offset, partial_length: entry.partialLength })), context: { sync_group_id: context.groupId,
          initiator_device_id: context.initiatorDeviceId, initiator_library_epoch: context.initiatorLibraryEpoch,
          receiver_device_id: context.responderDeviceId, receiver_library_epoch: context.responderLibraryEpoch } }));
      this.waitExit();
      void this.http.send(this.prepared).then(() => this.wake(), error => this.httpFailed(error));
    } catch (error) {
      this.fail(error, false);
      try {
        if (attempted) {
          try { this.accept(await attachmentBatchMetadata({ ...this.identity, action: 'stop' })); this.waitExit(); }
          catch (failure) { if (!missingOperation(failure)) throw failure; this.closed = true; this.actual.resolve(); }
          await this.actualExit; await this.http.cleaned(this.prepared);
        } else { this.closed = true; this.actual.resolve(); await this.http.discard(this.prepared); }
      } finally { await this.dispose(cancel, false); }
      throw error;
    }
    return { data: this.result.promise, stop: () => this.stop(), exit: async () => {
      try { await this.actualExit; await this.http.cleaned(this.prepared); }
      finally { await this.dispose(cancel); }
    } };
  }
  check() { this.http.input.signal?.throwIfAborted(); if (this.failure) throw this.failure.error; }
  failed() { return Boolean(this.failure); }
  accept(raw: unknown) {
    const snapshot = parseCompanionAttachmentBatchSnapshot(raw, this.identity, this.prepared.plan.entries);
    if (this.closed && snapshot.state !== 'closed') return;
    this.revision++;
    for (const fact of snapshot.files) {
      let file = this.records.get(fact.sequence);
      if (!file) {
        file = new CompanionAttachmentBatchFile(fact, this, this.prepared.plan.sealed);
        this.records.set(fact.sequence, file); file.claim();
      } else file.observe(fact);
    }
    if (snapshot.state === 'data_complete' || (snapshot.state === 'closed' && snapshot.outcome === 'complete')) {
      if (!this.dataHandled) {
        this.dataHandled = true;
        const result = companionAttachmentBatchResult(snapshot.result, this.prepared.plan.entries);
        void this.http.dataExited(this.prepared).then(() => this.result.resolve(result), error => this.fail(error));
      }
    } else if (snapshot.state === 'data_failed') {
      this.dataHandled = true;
      void this.http.dataExited(this.prepared).then(() => this.result.reject(new Error(snapshot.error)), error => this.fail(error));
    } else if (snapshot.state === 'stopped' || (snapshot.state === 'closed' && snapshot.outcome !== 'complete')) {
      this.fail(this.paused ? new AttachmentReceivePaused() : new Error(snapshot.error), false);
    }
    if (snapshot.state === 'closed') {
      this.closed = true; this.actual.resolve();
      void this.http.dataExited(this.prepared).catch(error => this.fail(error));
    }
  }
  private wake() {
    this.dirty = true;
    if (this.reading || this.closed) return;
    this.reading = this.read().finally(() => { this.reading = undefined; if (this.dirty && !this.closed) this.wake(); });
    void this.reading.catch(error => this.fail(error));
  }
  private async read() {
    while (this.dirty && !this.closed) {
      this.dirty = false;
      const revision = this.revision;
      try { this.accept(await attachmentBatchMetadata({ ...this.identity, action: 'read' })); }
      catch (error) { if (this.revision === revision && !this.closed) throw error; }
    }
  }
  private waitExit() {
    void FolioleCompanionSync.attachmentBatch({ ...this.identity, action: 'wait_exit' }).then(raw => this.accept(raw), error => {
      if (!this.closed) this.fail(error);
    });
  }
  private async httpFailed(error: unknown) {
    try {
      const snapshot = await attachmentBatchMetadata({ ...this.identity, action: 'read' });
      this.accept(snapshot);
      const state = parseCompanionAttachmentBatchSnapshot(snapshot, this.identity, this.prepared.plan.entries);
      if (state.state === 'data_complete' || (state.state === 'closed' && state.outcome === 'complete')) return;
      this.result.reject(this.paused ? new AttachmentReceivePaused() : error);
      if (state.state === 'prepared' || state.state === 'receiving') await this.stop();
    } catch (failure) { this.fail(failure); }
  }
  fail(error: unknown, stop = true) {
    this.failure ??= { error };
    this.result.reject(error); this.terminalState.reject(error);
    for (const file of this.records.values()) file.abort(error);
    if (stop && !this.closed) void this.stop().catch(() => undefined);
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      this.fail(this.paused ? new AttachmentReceivePaused() : new Error('attachment_batch_stopped'), false);
      if (!this.closed) {
        this.waitExit();
        this.accept(await attachmentBatchMetadata({ ...this.identity, action: 'stop' }));
      }
      await this.actualExit;
      await this.http.dataExited(this.prepared);
    })();
    return this.stopping;
  }
  private async dispose(cancel: () => void, remove = true) {
    this.stopYield(); this.http.input.signal?.removeEventListener('abort', cancel);
    await this.listener?.remove(); this.listener = undefined;
    if (this.closed && remove) await attachmentBatchMetadata({ ...this.identity, action: 'dispose' });
  }
}

function missingOperation(error: unknown) {
  return error instanceof Error && /attachment_batch_missing|not implemented|UNIMPLEMENTED/iu.test(error.message);
}
