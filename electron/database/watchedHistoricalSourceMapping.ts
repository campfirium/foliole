import path from 'node:path';

import { loadWatchedFolderConflictDecisions } from './watchedFolderConflictDecisions.js';

export function loadWatchedHistoricalSourceMapping() {
  const mapping = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const decision of loadWatchedFolderConflictDecisions()) {
    const selected = [...decision.selected_binding_ids].sort()[0];
    if (!selected) continue;
    for (const legacyRef of decision.source_alias_refs ?? []) {
      const targetRef = `watched:${selected}`;
      if (mapping.has(legacyRef) && mapping.get(legacyRef) !== targetRef) ambiguous.add(legacyRef);
      else mapping.set(legacyRef, targetRef);
    }
  }
  for (const legacyRef of ambiguous) mapping.delete(legacyRef);
  return mapping;
}

export function resolveWatchedHistoricalSourceRef(sourceRef: string) {
  return resolveAlias(loadWatchedHistoricalSourceMapping(), sourceRef);
}

export function loadHistoricalRefsForWatchedBinding(bindingId: string) {
  const targetRef = `watched:${bindingId}`;
  const mapping = loadWatchedHistoricalSourceMapping();
  return [...mapping].filter(([legacyRef]) => resolveAlias(mapping, legacyRef) === targetRef)
    .map(([legacyRef]) => legacyRef);
}

function resolveAlias(mapping: Map<string, string>, sourceRef: string) {
  const seen = new Set<string>();
  let current = sourceRef;
  while (mapping.has(current)) {
    if (seen.has(current)) return sourceRef;
    seen.add(current);
    current = mapping.get(current)!;
  }
  return current;
}

export function normalizeWatchedRelativeLocation(value: string | null) {
  const normalized = value?.replaceAll('\\', '/').replace(/^\.\//u, '') ?? '';
  if (!normalized || normalized === '..' || normalized.startsWith('../') ||
      path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//u.test(normalized)) return null;
  return normalized;
}
