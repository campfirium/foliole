import { compareSyncIdentityText } from './syncIdentityKeyOrder.js';
import type { SyncIdentityNodeFactSection } from './syncIdentityNodeFactPage.js';
import { iterateSyncIdentityReviewFacts } from './syncIdentityNodeFactReadAll.js';

type ReadPage = (section: SyncIdentityNodeFactSection, after: string | null) => Promise<unknown>;
const COLUMNS = ['id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version',
  'reviewed_at', 'due_before', 'stability_before', 'difficulty_before',
  'due_after', 'stability_after', 'difficulty_after'] as const;

/** Merge two ordered page streams without retaining either complete review history. */
export async function compareSyncIdentityReviewFacts(nodeId: string, headId: string,
  readLeft: ReadPage, readRight: ReadPage) {
  const left = iterateSyncIdentityReviewFacts(nodeId, headId, readLeft);
  const right = iterateSyncIdentityReviewFacts(nodeId, headId, readRight);
  let a = await left.next();
  let b = await right.next();
  let leftNeedsRepair = false;
  let rightNeedsRepair = false;
  while (!a.done || !b.done) {
    const comparison = a.done ? 1 : b.done ? -1 :
      compareSyncIdentityText(String(a.value.op_id), String(b.value.op_id));
    if (comparison === 0 && !a.done && !b.done) {
      const leftFact = a.value;
      const rightFact = b.value;
      if (JSON.stringify(COLUMNS.map((column) => leftFact[column])) !==
          JSON.stringify(COLUMNS.map((column) => rightFact[column]))) {
        throw new Error(`sync_review_log_op_mismatch:${String(a.value.op_id)}`);
      }
      a = await left.next();
      b = await right.next();
    } else if (comparison < 0) {
      rightNeedsRepair = true;
      a = await left.next();
    } else {
      leftNeedsRepair = true;
      b = await right.next();
    }
  }
  return { leftNeedsRepair, rightNeedsRepair };
}
