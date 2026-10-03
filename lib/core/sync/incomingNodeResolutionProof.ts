import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { buildResolutionRecord } from './syncNodeResolution.js';

export function provenIncomingResolutionParents(head: NativeSyncNodeRecord, records: NativeSyncNodeRecord[]) {
  if (head.host_name !== 'desktop-resolution' || head.snapshot.kind !== 'topic') return [];
  const body = head.body_text ?? head.snapshot.content;
  if (typeof body !== 'string') return [];
  const parents = head.parent_version_ids ?? (head.parent_version_id ? [head.parent_version_id] : []);
  const eligible = records.filter(record => record.object_id === head.object_id && record.version_id &&
    record.snapshot.kind === 'topic' && Number.isFinite(Date.parse(record.version_created_at ?? '')));
  const proven = new Set<string>();
  for (const parent of eligible.filter(record => parents.includes(record.version_id!))) {
    for (const candidate of eligible) {
      if (candidate.version_id === parent.version_id || candidate.version_id === head.version_id) continue;
      const reconstructed = buildResolutionRecord([parent, candidate], head, body, head.snapshot);
      if (reconstructed.version_id === head.version_id) proven.add(candidate.version_id!);
    }
  }
  return [...proven];
}
