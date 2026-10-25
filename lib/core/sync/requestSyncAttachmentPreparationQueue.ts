import { prepareRequestSyncAttachment, pullRequestSyncAttachmentWindows } from './requestSyncAttachmentPull.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import type { RequestSyncExchange } from './requestSyncDatabaseExchange.js';

type Preparation = Awaited<ReturnType<typeof prepareRequestSyncAttachment>>;
type Settled = { kind: 'ready'; value: Preparation } | { kind: 'failed'; error: unknown };
type Entry = { key: string; result: Promise<Settled> };
type Outcome = Awaited<ReturnType<typeof pullRequestSyncAttachmentWindows>>;

/** Two disposable preparations, excluding the active send and including its next window. */
export async function runPreparedAttachmentPulls(input: {
  host: RequestSyncAttachmentHost; exchange: RequestSyncExchange; keys: string[];
  failed: Set<string>; pendingKeys: Set<string>; shouldYield(): boolean;
  attempt(key: string, execute: () => Promise<Outcome>): Promise<void>;
}) {
  const queue: Entry[] = [];
  let cursor = 0, attempted = false;
  const fill = (capacity = 2) => {
    while (queue.length < capacity && cursor < input.keys.length) {
      if ((attempted || queue.length > 0) && input.shouldYield()) break;
      const key = input.keys[cursor++]!;
      if (input.failed.has(key)) { input.pendingKeys.add(key); continue; }
      queue.push({ key, result: prepareRequestSyncAttachment(input.host, input.exchange, key, input.shouldYield)
        .then(value => ({ kind: 'ready', value }), (error: unknown) => ({ kind: 'failed', error })) });
    }
  };
  try {
    fill();
    while (queue.length && (!attempted || !input.shouldYield())) {
      const current = queue.shift()!;
      attempted = true;
      try {
        await input.attempt(current.key, async () => {
          const ready = await current.result;
          if (input.shouldYield()) return { complete: false, blocks: 0 };
          if (ready.kind === 'failed') throw ready.error;
          return pullRequestSyncAttachmentWindows(input.host, input.exchange, current.key, input.shouldYield,
            ready.value, hasNext => fill(hasNext ? 1 : 2));
        });
      } finally { await dispose(current); }
      fill();
    }
  } finally {
    for (const entry of queue) input.pendingKeys.add(entry.key);
    for (const key of input.keys.slice(cursor)) input.pendingKeys.add(key);
    await Promise.all(queue.map(dispose));
  }
}

async function dispose(entry: Entry) {
  const ready = await entry.result;
  if (ready.kind === 'ready') await ready.value?.window?.close();
}
