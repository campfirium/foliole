import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { chooseEvidenceProjection } from './syncNodeResolution.js';

type Snapshot = NativeSyncNodeRecord['snapshot'];

/** Snapshot fields computed from a body; they follow whichever side's body the merge keeps. */
const BODY_DERIVED_FIELDS = ['attachments', 'image_sources', 'opening_text', 'resource_references', 'text_selection'] as const;

function recordBody(record: NativeSyncNodeRecord) {
  return record.body_text ?? record.snapshot.content ?? '';
}

/**
 * Three-way body merge for item and folder heads. A body only one side changed wins as is;
 * a body both sides changed follows the article winner rule, and the losing body stays in its version.
 */
export async function mergeNodeBody(
  port: DbPort, baseBody: string | null, local: NativeSyncNodeRecord, incoming: NativeSyncNodeRecord, snapshot: Snapshot
): Promise<{ body: string; snapshot: Snapshot }> {
  const localBody = recordBody(local);
  const incomingBody = recordBody(incoming);
  if (localBody === incomingBody) return { body: localBody, snapshot };
  if (baseBody !== null && localBody === baseBody) return { body: incomingBody, snapshot };
  if (baseBody !== null && incomingBody === baseBody) return { body: localBody, snapshot };
  const { body, winner } = await chooseEvidenceProjection(port, local, incoming, baseBody ?? '');
  const derived = Object.fromEntries(BODY_DERIVED_FIELDS.map((key) => [key, winner.snapshot[key]]));
  return { body, snapshot: { ...snapshot, ...derived } as Snapshot };
}
