import { AttachmentVerificationPending } from './attachmentSourceVerification.js';
import { attachmentDataYield, attachmentWorkBudget } from './attachmentWorkBudget.js';
import { PDF_TEXT_EXTRACTOR_VERSION } from './pdfTextArtifact.js';
import { attachmentRequest, pullRequestSyncAttachmentWindows, singleAttachmentRequest as single } from './requestSyncAttachmentPull.js';
import { pushRequestSyncAttachmentWindows } from './requestSyncAttachmentPush.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { runRequestSyncAttachmentStages } from './requestSyncAttachmentStages.js';
import type { RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { exchangePdfTextArtifacts } from './requestSyncPdfText.js';

export async function pullRequestSyncAttachment(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange, storageKey: string) {
  return pullRequestSyncAttachmentWindows(host, exchange, storageKey, attachmentWorkBudget());
}

const retryFirstRounds = new Set<string>();
// Passes that only advance a source scan still count as progress, up to this many in a row.
const VERIFICATION_ONLY_PASSES = 64;

/** Drain the transfer lists pass after pass; only pending data work or a pass without progress ends the stream. */
export async function exchangeRequestSyncAttachments(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  report: (storageKey: string, error: unknown) => void, shouldYield = attachmentDataYield()) {
  const total = { transferred: 0, blocks: 0 };
  // A key that failed in this stream waits for the next round instead of repeating within it.
  const failed = new Set<string>();
  for (let verificationOnly = 0; ;) {
    const { verifying, ...pass } = await exchangeAttachmentPass(host, exchange, report, shouldYield, failed);
    total.transferred += pass.transferred;
    total.blocks += pass.blocks;
    const progressed = pass.transferred > 0 || pass.blocks > 0;
    verificationOnly = progressed ? 0 : verificationOnly + 1;
    const stalled = !progressed && (!verifying || verificationOnly >= VERIFICATION_ONLY_PASSES);
    if (stalled || pass.pending === 0 || shouldYield()) return { ...pass, ...total };
  }
}

async function exchangeAttachmentPass(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  report: (storageKey: string, error: unknown) => void, shouldYield: () => boolean, failed: Set<string>) {
  exchange.signal?.throwIfAborted();
  let remoteNeeds = new Set<string>();
  let pendingScan = false;
  let parsingPending = false;
  await attachmentRequest(exchange, { operation: 'needs' }, async message => {
    if (message.state !== 'partial' && message.state !== 'end') throw new Error('attachment_needs_invalid');
    for (const key of message.storageKeys) remoteNeeds.add(key);
    pendingScan ||= message.pending;
    parsingPending ||= message.parsingPending;
  });
  const roundKey = JSON.stringify(exchange.context);
  const retryFirst = retryFirstRounds.has(roundKey);
  if (retryFirst) retryFirstRounds.delete(roundKey); else retryFirstRounds.add(roundKey);
  remoteNeeds = new Set(prioritizeRetryPairs([...remoteNeeds], retryFirst));
  const demand = await host.needsSlice(shouldYield);
  const local = { ...demand, keys: prioritizeRetryPairs(demand.keys, retryFirst),
    pdfTextKeys: prioritizeRetryPairs(demand.pdfTextKeys ?? [], retryFirst) };
  pendingScan ||= local.pending;
  parsingPending ||= local.parsingPending ?? false;
  const { result, pendingKeys, attempt, verificationPending } = createAttachmentProgress(host, exchange, report, failed);
  let textPending = 0;
  const stages = [
    { name: 'pull' as const, defer: () => { local.keys.forEach(key => pendingKeys.add(key)); }, run: async () => {
      let attempted = false;
      for (const key of local.keys) {
        if (failed.has(key) || (attempted && shouldYield())) { pendingKeys.add(key); continue; }
        attempted = true;
        await attempt(key, () => pullRequestSyncAttachmentWindows(host, exchange, key, shouldYield));
      }
    } },
    { name: 'text' as const, defer: () => { textPending = local.pdfTextKeys?.length ?? 0; }, run: async () => {
      const text = await exchangePdfTextArtifacts({ host, ...(exchange.signal ? { signal: exchange.signal } : {}),
        keys: local.pdfTextKeys ?? [], shouldYield, report,
        describe: storageKey => single(exchange, { operation: 'describe', storageKey, derive: 'pdf_text',
          extractorVersion: PDF_TEXT_EXTRACTOR_VERSION }),
        pull: key => pullRequestSyncAttachmentWindows(host, exchange, key, shouldYield) });
      result.blocks += text.blocks;
      result.transferred += text.transferred;
      textPending = text.pending;
    } },
    { name: 'push' as const, defer: () => { remoteNeeds.forEach(key => pendingKeys.add(key)); }, run: async () => {
      let attempted = false;
      for (const key of remoteNeeds) {
        if (failed.has(key) || (attempted && shouldYield())) { pendingKeys.add(key); continue; }
        attempted = true;
        await attempt(key, () => pushRequestSyncAttachmentWindows(host, exchange, key, shouldYield));
      }
    } }
  ];
  await runRequestSyncAttachmentStages(exchange.context, stages.filter(stage =>
    stage.name === 'pull' ? local.keys.length > 0 : stage.name === 'push' ? remoteNeeds.size > 0
      : Boolean(local.pdfTextKeys?.length)), () => result.blocks + pendingKeys.size);
  if (!pendingScan && !pendingKeys.size && !textPending) retryFirstRounds.delete(roundKey);
  return { ...result, pending: pendingScan ? null : pendingKeys.size + textPending, verifying: verificationPending(),
    yielded: parsingPending || verificationPending() || (result.blocks > 0 && (pendingScan || (pendingKeys.size > 0 && shouldYield()))) };
}

function createAttachmentProgress(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  report: (key: string, error: unknown) => void, failed: Set<string>) {
  const result = { transferred: 0, blocks: 0 };
  const pendingKeys = new Set<string>();
  let verifying = false;
  const attempt = async (key: string, execute: () => Promise<{ complete: boolean; blocks: number; verificationPending?: boolean | undefined }>) => {
    exchange.signal?.throwIfAborted();
    try {
      await host.attempted?.(key);
      const slice = await execute();
      result.blocks += slice.blocks;
      verifying ||= slice.verificationPending === true;
      if (slice.complete) result.transferred++;
      else pendingKeys.add(key);
    }
    catch (error) {
      exchange.signal?.throwIfAborted(); pendingKeys.add(key);
      if (error instanceof AttachmentVerificationPending) verifying = true;
      else { failed.add(key); report(key, error); }
    }
  };
  return { result, pendingKeys, attempt, verificationPending: () => verifying };
}

// Interleaved new/retry pairs alternate their first chance when a data round leaves only one attempt.
function prioritizeRetryPairs(keys: readonly string[], retryFirst: boolean) {
  if (!retryFirst) return [...keys];
  const ordered = [...keys];
  for (let i = 0; i + 1 < ordered.length; i += 2) [ordered[i], ordered[i + 1]] = [ordered[i + 1]!, ordered[i]!];
  return ordered;
}
