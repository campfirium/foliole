import { parseChangedAttachmentArticles, readAttachmentArticles } from './attachmentDemandPreparation.js';
import { attachmentWorkBudget } from './attachmentWorkBudget.js';
import type { DbPort } from './dbPort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';

/** Compare only nodes in this committed batch, including changes to an already queued article. */
export async function trackCommittedAttachmentArticles<T>(db: DbPort, host: RequestSyncDatabaseHost,
  ids: readonly string[], apply: () => Promise<T>) {
  if (!host.attachmentArticlesCommitted || !ids.length) return { result: await apply(), changed: [] as string[] };
  const before = new Map((await readAttachmentArticles(db, ids)).map(row => [row.article_id, row]));
  const result = await apply();
  const after = await readAttachmentArticles(db, ids);
  const fields = ['id', 'content', 'body_blob_hash', 'resource_references', 'deleted_at'] as const;
  return { result, changed: after.filter(row => fields.some(key => before.get(row.article_id)?.[key] !== row[key]))
    .map(row => row.article_id) };
}

/** One bounded task owns errors and cancellation; callbacks enqueue IDs without awaiting parsing. */
export function createRequestSyncAttachmentPreparation(host: RequestSyncDatabaseHost, signal?: AbortSignal) {
  const controller = new AbortController();
  const cancelFromParent = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', cancelFromParent, { once: true });
  if (signal?.aborted) cancelFromParent();
  const combined = controller.signal;
  const pending = new Set<string>();
  let task: Promise<void> | undefined;
  let failure: { error: unknown } | undefined;
  function enqueue(ids: readonly string[]) {
    combined.throwIfAborted();
    if (failure) throw failure.error;
    if (!ids.length) return;
    for (const id of ids) pending.add(id);
    task ??= drain().catch(error => { failure = { error }; });
  }
  async function drain() {
    try {
      while (pending.size) {
        combined.throwIfAborted();
        const ids = [...pending].slice(0, 128);
        ids.forEach(id => pending.delete(id));
        await parseChangedAttachmentArticles(host, attachmentWorkBudget(1000), ids, combined);
        // Unfinished rows remain in the durable queue; each following batch keeps the same budget.
      }
    } finally { task = undefined; }
  }
  return {
    dispose: () => signal?.removeEventListener('abort', cancelFromParent),
    bind: (database: RequestSyncDatabaseHost, requestSignal?: AbortSignal) => ({ ...database,
      attachmentArticlesCommitted(ids: readonly string[]) {
        requestSignal?.throwIfAborted();
        enqueue(ids);
        if (!requestSignal || !task) return;
        const cancelRequest = () => controller.abort(requestSignal.reason);
        requestSignal.addEventListener('abort', cancelRequest, { once: true });
        void task.then(() => requestSignal.removeEventListener('abort', cancelRequest));
        if (requestSignal.aborted) cancelRequest();
      }
    }),
    async finish() {
      await task;
      combined.throwIfAborted();
      if (failure) throw failure.error;
    },
    async cancel(reason: unknown) {
      signal?.removeEventListener('abort', cancelFromParent);
      controller.abort(reason);
      pending.clear();
      await task;
    }
  };
}

export async function withRequestSyncAttachmentPreparation<T>(host: RequestSyncDatabaseHost,
  signal: AbortSignal | undefined, execute: (prepared: RequestSyncDatabaseHost) => Promise<T>): Promise<T> {
  if (host.attachmentArticlesCommitted) return execute(host);
  const preparation = createRequestSyncAttachmentPreparation(host, signal);
  try {
    const result = await execute(preparation.bind(host));
    await preparation.finish();
    return result;
  } catch (error) {
    await preparation.cancel(error);
    throw error;
  } finally { preparation.dispose(); }
}
