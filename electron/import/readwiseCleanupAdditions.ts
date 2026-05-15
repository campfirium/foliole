import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';

interface ReadwiseCleanupAdditionRow {
  anchor_link: string | null;
  created_at: string;
  id: string;
}

const IMPORT_TIMESTAMP_TOLERANCE_MS = 1000;

function isAfterImportTolerance(timestamp: string, importedAt: string) {
  return Date.parse(timestamp) > Date.parse(importedAt) + IMPORT_TIMESTAMP_TOLERANCE_MS;
}

function isImportedAnchorLink(anchorLink: string | null) {
  if (!anchorLink) {
    return false;
  }
  try {
    const raw = JSON.parse(anchorLink) as { origin?: unknown };
    return raw.origin === 'imported' && parseStoredAnchorLink(anchorLink) !== null;
  } catch {
    return false;
  }
}

export function hasReadwiseCleanupAdditions(
  rootNodeId: string,
  importedAt: string,
  subtree: ReadwiseCleanupAdditionRow[]
) {
  return subtree.some((row) => {
    if (row.id === rootNodeId || !isAfterImportTolerance(row.created_at, importedAt)) {
      return false;
    }
    return !isImportedAnchorLink(row.anchor_link);
  });
}
