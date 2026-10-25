import type { AttachmentBatchReceiveInput, AttachmentBatchSealedFile } from '../../../../../../lib/core/sync/attachmentBatchReceiveContract.js';
import type { NativeAttachmentBatchIdentity } from '../../../../../../lib/platform/nativeAttachmentBatchContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';

import { attachmentBatchDeferred, attachmentBatchMetadata } from './companionAttachmentBatchCalls.js';
import { attachmentBatchVerificationSchema, type CompanionAttachmentBatchSnapshot } from './companionAttachmentBatchSchema.js';

type Fact = CompanionAttachmentBatchSnapshot['files'][number];
export interface CompanionAttachmentBatchFileHost {
  identity: NativeAttachmentBatchIdentity;
  terminal: Promise<never>;
  actualExit: Promise<void>;
  accept(raw: unknown): void;
  check(): void;
  failed(): boolean;
  fail(error: unknown): void;
}

/** Shared ownership is installed before claim; only retained claimed facts make the verifier ready. */
export class CompanionAttachmentBatchFile {
  readonly ready = attachmentBatchDeferred<void>();
  private claimed = false;
  readonly control: AttachmentBatchSealedFile;
  constructor(readonly fact: Fact, private readonly host: CompanionAttachmentBatchFileHost, sealed: AttachmentBatchReceiveInput['sealed']) {
    const { sequence, storage_key: storageKey, byte_length: byteLength } = fact;
    const command = async (action: 'verify' | 'publish' | 'discard') => {
      host.check();
      const result = await Promise.race([FolioleCompanionSync.attachmentBatch({ ...host.identity, action, sequence }), host.terminal]);
      host.accept(result); return result;
    };
    this.control = { resource: { storageKey, byteLength }, ready: this.ready.promise,
      verify: async () => {
        const result = attachmentBatchVerificationSchema.parse(await command('verify')).verification;
        if (result.sequence !== sequence) throw new Error('attachment_batch_verification_identity_invalid'); return result.valid;
      },
      publish: async () => { await command('publish'); }, discard: async () => { await command('discard'); },
      settle: async outcome => {
        const result = await attachmentBatchMetadata({ ...host.identity, action: 'settle', sequence, outcome });
        host.accept(result);
      },
      exit: async () => { if (host.failed()) await host.actualExit; }
    };
    sealed(this.control);
    this.observe(fact);
  }
  claim() {
    if (this.claimed) return;
    const claim = attachmentBatchMetadata({ ...this.host.identity, action: 'claim', sequences: [this.fact.sequence] });
    void claim.then(result => this.host.accept(result), error => { if (!this.claimed) this.host.fail(error); });
  }
  observe(fact: Fact) {
    if (fact.storage_key !== this.fact.storage_key || fact.byte_length !== this.fact.byte_length) throw new Error('attachment_batch_completion_changed');
    if (fact.state === 'claimed') { this.claimed = true; this.ready.resolve(); }
  }
  abort(error: unknown) { this.ready.reject(error); }
}
