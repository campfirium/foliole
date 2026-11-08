import { AttachmentReceivePaused } from './attachmentBlockTransfer.js';
import type { AttachmentReceiveSession } from './attachmentReceiveSession.js';
import { prepareRequestSyncAttachment, pullRequestSyncAttachmentWindows } from './requestSyncAttachmentPull.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { createAttachmentSegments, type AttachmentDemandSlice } from './requestSyncAttachmentSegments.js';
import type { RequestSyncExchange } from './requestSyncDatabaseExchange.js';

type Preparation = Awaited<ReturnType<typeof prepareRequestSyncAttachment>>;
type Settled = { kind: 'ready'; value: Preparation } | { kind: 'failed'; error: unknown };
type Entry = { key: string; result: Promise<Settled> };
type Outcome = Awaited<ReturnType<typeof pullRequestSyncAttachmentWindows>>;

type PullInput = {
  host: RequestSyncAttachmentHost; exchange: RequestSyncExchange; keys: string[];
  nextSlice?(excluded: readonly string[]): Promise<AttachmentDemandSlice>;
  prepareSlice?(slice: AttachmentDemandSlice, host: RequestSyncAttachmentHost): Promise<void>;
  failed: Set<string>; pendingKeys: Set<string>; shouldYield(): boolean;
  attempt(key: string, execute: () => Promise<Outcome>): Promise<void>;
};

/** Two disposable preparations, excluding the active send and including its next window. */
export async function runPreparedAttachmentPulls(input: PullInput) {
  const session = await input.host.openReceiveSession?.({
    ...(input.exchange.signal ? { signal: input.exchange.signal } : {}), shouldYield: input.shouldYield
  });
  const host = session ? { ...input.host, receiveWindow: session.receiveWindow } : input.host;
  const finishing = new Set<Promise<{ error: unknown } | undefined>>();
  const segments = createAttachmentSegments(input.keys, input.nextSlice);
  const queue: Entry[] = [];
  let attempted = false;
  const fill = (capacity = 2) => {
    while (queue.length < capacity && segments.hasKeys()) {
      if ((attempted || queue.length > 0) && input.shouldYield()) break;
      const key = segments.take()!;
      if (input.failed.has(key)) { input.pendingKeys.add(key); continue; }
      queue.push({ key, result: prepareRequestSyncAttachment(input.host, input.exchange, key, input.shouldYield)
        .then(value => ({ kind: 'ready', value }), (error: unknown) => ({ kind: 'failed', error })) });
    }
  };
  const replenish = async () => {
    fill();
    while (!input.shouldYield() && !segments.hasKeys()) {
      const next = await segments.advance();
      if (!next || input.shouldYield()) break;
      await input.prepareSlice?.(next, settledHost(input.host, session));
      fill();
    }
  };
  try {
    await replenish();
    while (queue.length && (!attempted || !input.shouldYield())) {
      const current = queue.shift()!;
      attempted = true;
      try {
        const { receipt, finished } = beginPull(input, host, current, hasNext => fill(hasNext ? 1 : 2), session);
        finishing.add(finished);
        void finished.then(outcome => { if (!outcome) finishing.delete(finished); });
        await receipt;
      } finally { await dispose(current); }
      await replenish();
    }
  } finally {
    for (const entry of queue) input.pendingKeys.add(entry.key);
    try { await segments.close(key => input.pendingKeys.add(key)); }
    finally { await drain(queue, finishing, session); }
  }
  input.exchange.signal?.throwIfAborted();
}

async function dispose(entry: Entry) {
  const ready = await entry.result;
  if (ready.kind === 'ready') await ready.value?.window?.close();
}

function beginPull(input: PullInput, host: RequestSyncAttachmentHost, current: Entry,
  onDispatch: (hasNext: boolean) => void, session?: AttachmentReceiveSession) {
  let received = () => {};
  const receipt = new Promise<void>(resolve => { received = resolve; });
  const operation = input.attempt(current.key, async () => {
    const ready = await current.result;
    if (input.shouldYield()) return { complete: false, blocks: 0 };
    if (ready.kind === 'failed') throw ready.error;
    const result = await pullRequestSyncAttachmentWindows(host, input.exchange, current.key, input.shouldYield,
      ready.value, onDispatch);
    received();
    try { await session?.settled(current.key); }
    catch (error) {
      if (!(error instanceof AttachmentReceivePaused)) throw error;
      return { ...result, complete: false };
    }
    return result;
  });
  void operation.then(received, received);
  return { receipt, finished: operation.then(() => undefined, (error: unknown) => ({ error })) };
}

async function drain(queue: Entry[], finishing: Set<Promise<{ error: unknown } | undefined>>, session?: AttachmentReceiveSession) {
  let outcomes;
  try { await Promise.all(queue.map(dispose)); }
  finally { outcomes = await Promise.all(finishing); await session?.close(); }
  const failure = outcomes.find(outcome => outcome !== undefined);
  if (failure) throw failure.error;
}

function settledHost(host: RequestSyncAttachmentHost, session?: AttachmentReceiveSession): RequestSyncAttachmentHost {
  if (!session) return host;
  return { ...host, async receiveWindow(resource, offset, execute) {
    const result = await session.receiveWindow(resource, offset, execute);
    await session.settled(resource.storageKey);
    return result;
  } };
}
