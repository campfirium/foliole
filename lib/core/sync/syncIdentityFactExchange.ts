import { syncIdentityFactTailSchema } from './syncIdentityFactTransfer.js';
import type { SyncIdentityFactTransfer } from './syncIdentityFactTransfer.js';
import { buildSyncIdentityPackPage, type SyncIdentityPackPage } from './syncIdentityPackPage.js';

interface FactExchangeArgs {
  page: SyncIdentityPackPage;
  digest: string;
  transfer: (page: SyncIdentityPackPage) => Promise<{ applied: boolean; factTail?: unknown }>;
  readParent?: (page: SyncIdentityPackPage) => Promise<SyncIdentityPackPage | null>;
}

interface Progress { pageIndex: number; previousPageId: string | null; appliedPages: number }

async function parentPages(args: FactExchangeArgs) {
  const parents: SyncIdentityPackPage[] = [];
  const seen = new Set([args.page.objects[0]?.object_id]);
  let child = args.page;
  while (args.readParent) {
    const parent = await args.readParent(child);
    if (!parent) break;
    const id = parent.objects[0]?.object_id;
    if (!id || seen.has(id) || !parent.facts || parent.objects.length !== 1 ||
        parent.group_id !== child.group_id || parent.source_peer_id !== child.source_peer_id ||
        parent.target_peer_id !== child.target_peer_id || parent.source_view_id !== child.source_view_id ||
        parent.restore_id !== child.restore_id) throw new Error('sync_identity_fact_parent_invalid');
    seen.add(id);
    parents.push(parent);
    child = parent;
  }
  return parents.reverse();
}

/** Transfer original ancestor facts without changing the global object adoption order. */
export async function exchangeSyncIdentityNodeFactPages(args: FactExchangeArgs) {
  const progress: Progress = { pageIndex: args.page.page_index,
    previousPageId: args.page.previous_page_id, appliedPages: 0 };
  for (const parent of await parentPages(args)) {
    await transferSections({ ...args, page: parent, digest: parent.facts!.digest }, progress);
  }
  await transferSections(args, progress);
  const page = buildSyncIdentityPackPage({ ...args.page, page_index: progress.pageIndex,
    previous_page_id: progress.previousPageId,
    facts: { section: 'head', after: null, limit: 64, digest: args.digest } });
  if ((await args.transfer(page)).applied) progress.appliedPages += 1;
  return { page, pageCount: progress.pageIndex - args.page.page_index + 1,
    appliedPages: progress.appliedPages };
}

async function transferSections(args: FactExchangeArgs, progress: Progress) {
  for (const section of ['versions', 'parents', 'reviews'] as const) {
    let after: string | null = null;
    let chunk: SyncIdentityFactTransfer['chunk'];
    let limit = 64;
    for (;;) {
      const page = buildSyncIdentityPackPage({ ...args.page, page_index: progress.pageIndex,
        previous_page_id: progress.previousPageId,
        facts: { section, after, limit, digest: args.digest, ...(chunk ? { chunk } : {}) } });
      let result: Awaited<ReturnType<typeof args.transfer>>;
      try { result = await args.transfer(page); }
      catch (error) {
        if (limit <= 1 || !(error instanceof Error) ||
            !error.message.includes('sync_identity_pack_page_over_budget')) throw error;
        limit = Math.max(1, Math.floor(limit / 2));
        continue;
      }
      const tail = syncIdentityFactTailSchema.parse(result.factTail);
      if (result.applied) progress.appliedPages += 1;
      progress.previousPageId = page.page_id;
      progress.pageIndex += 1;
      if (tail.chunk) {
        if (tail.nextAfter !== after || tail.chunk.nextOffset <= (chunk?.offset ?? 0) ||
            chunk && (tail.chunk.key !== chunk.key || tail.chunk.total !== chunk.total)) {
          throw new Error('sync_identity_fact_chunk_no_progress');
        }
        chunk = { key: tail.chunk.key, offset: tail.chunk.nextOffset, total: tail.chunk.total };
        continue;
      }
      chunk = undefined;
      if (tail.nextAfter === null) break;
      if (tail.nextAfter === after) throw new Error('sync_identity_fact_page_no_progress');
      after = tail.nextAfter;
    }
  }
}
