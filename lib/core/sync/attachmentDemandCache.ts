import { loadNodeOwnedArticleResourceNeeds } from './nodeOwnedArticleResourceNeeds.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';

/** Library-owned memory only. File presence is never cached here. */
export function createAttachmentDemandCache() {
  let revision: string | undefined;
  let epoch: string | undefined;
  let startedAtBeginning = true;
  let unreadable = false;
  let after: string | null = null;
  let complete = false;
  let keys = new Set<string>();
  let running: Promise<unknown> = Promise.resolve();
  const read = async (host: Pick<RequestSyncDatabaseHost, 'readSnapshot'>, shouldYield: () => boolean) => {
    do {
      const page = await host.readSnapshot(async db => {
        const [proof] = await db.query<{ library_epoch: string; proof_revision: number }>(
          'SELECT library_epoch, proof_revision FROM node_version_local_proof_state WHERE singleton_id = 1');
        if (!proof) throw new Error('attachment_demand_revision_missing');
        const current = `${proof.library_epoch}:${proof.proof_revision}`;
        if (revision !== current) {
          if (epoch !== proof.library_epoch || complete) after = null;
          epoch = proof.library_epoch;
          revision = current;
          startedAtBeginning = after === null;
          complete = false;
          unreadable = false;
          keys = new Set();
        }
        if (complete) return null;
        const nodes = await db.query<{ id: string }>(`SELECT id FROM nodes WHERE deleted_at IS NULL
          ${after === null ? '' : 'AND id > ?'} ORDER BY id LIMIT 128`, after === null ? [] : [after]);
        const result = await loadNodeOwnedArticleResourceNeeds(db, nodes.map(node => node.id));
        unreadable ||= result.unreadableArticleIds.length > 0;
        return { keys: result.needs.map(need => need.storageKey), last: nodes.at(-1)?.id ?? null,
          complete: nodes.length < 128 };
      });
      if (page) {
        page.keys.forEach(key => keys.add(key));
        after = page.last;
        if (page.complete) {
          complete = startedAtBeginning && !unreadable;
          after = null;
          startedAtBeginning = true;
          // Retry incomplete bodies next round without withholding readable references.
          if (unreadable) { unreadable = false; return { keys: [...keys], pending: true }; }
        }
      }
      if (complete) return { keys: [...keys], pending: false };
    } while (!shouldYield());
    return { keys: [...keys], pending: true };
  };
  return (host: Pick<RequestSyncDatabaseHost, 'readSnapshot'>, shouldYield: () => boolean) => {
    const result = running.then(() => read(host, shouldYield));
    running = result.catch(() => undefined);
    return result;
  };
}
