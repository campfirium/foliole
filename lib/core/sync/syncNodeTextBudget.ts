import { parseStoredAnchorLink } from '../database/anchorLinkCodec.js';
import { assertNodeAnchorTextWithinBudget, assertNodeTextWithinBudget } from '../nodes/nodeTextBudget.js';

import type { FramedSyncNodeMetadata } from './framedSyncNodeRestore.js';

/** Body and identity-only history retain their existing storage rules. */
export function assertSyncNodeTextWithinBudget(snapshot: FramedSyncNodeMetadata['snapshot']) {
  assertNodeTextWithinBudget(snapshot.title, 'title');
  assertNodeTextWithinBudget(snapshot.reveal, 'reveal');
  assertNodeAnchorTextWithinBudget(parseStoredAnchorLink(snapshot.anchor_link));
}
