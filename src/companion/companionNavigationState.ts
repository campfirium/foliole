import { z } from 'zod';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { isCanonicalTrashedNodeId, isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

const directorySelection = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('root') }),
  z.object({ kind: z.literal('internal'), nodeId: z.string() }),
  z.object({ kind: z.literal('virtual'), nodeId: z.string() }),
  z.object({ kind: z.literal('trash') }),
  z.object({ kind: z.literal('trashFolder'), nodeId: z.string() }),
  z.object({ kind: z.literal('externalFolder'), folderId: z.string() }),
  z.object({ kind: z.literal('externalDirectory'), folderId: z.string(), directoryPath: z.string() }),
  z.object({ kind: z.literal('externalDocument'), documentId: z.string() })
]);

const navigationSchema = z.object({
  activeAction: z.enum(['review', 'recent', 'search', 'more']),
  selectedBrowseNodeId: z.string().nullable(),
  browseReturnNodeId: z.string().nullable(),
  backlinkReturnNodeIds: z.array(z.string()).default([]),
  isBrowseDirectoryOpen: z.boolean(),
  flowSessionMode: z.enum(['recommended', 'review-first', 'reading-only']).default('recommended'),
  directorySelection,
  settingsPage: z.enum(['reminders', 'learning', 'clozeGuard', 'webLookup', 'foregroundTime', 'reviewStatistics', 'list', 'sync', 'device', 'storage', 'backup', 'attachments', 'appearance', 'about', 'logs', 'diagnostics', 'debug',
    'tabs', 'syncGroup', 'syncActivity', 'syncConnection']),
  searchTopicNodeId: z.string().nullable(),
  searchQuery: z.string(),
  externalScrollTopById: z.record(z.string(), z.number().nonnegative()).default({}),
  originalPdfNodeId: z.string().nullable().default(null),
  pdfPositionById: z.record(z.string(), z.object({ page: z.number().int().positive(), fraction: z.number().min(0).max(1) })).default({}),
  searchExternalDocumentId: z.string().nullable(),
  searchPdf: z.object({ attachment_id: z.string(), page: z.number().int().positive() }).nullable()
});

export type CompanionNavigationState = z.infer<typeof navigationSchema>;

export function initialCompanionNavigation(hasWorkspace: boolean): CompanionNavigationState {
  return {
    activeAction: hasWorkspace ? 'review' : 'more', selectedBrowseNodeId: null, browseReturnNodeId: null,
    backlinkReturnNodeIds: [], isBrowseDirectoryOpen: false, flowSessionMode: 'recommended', directorySelection: { kind: 'root' },
    settingsPage: 'list', searchTopicNodeId: null, searchQuery: '',
    searchExternalDocumentId: null, searchPdf: null, externalScrollTopById: {}, originalPdfNodeId: null, pdfPositionById: {}
  };
}

const legacyBrowseSort = z.object({
  browseSortKey: z.enum(['dateDeleted', 'dateImported', 'dateLastOpened', 'dateSaved', 'manual', 'name']),
  browseSortDirection: z.enum(['asc', 'desc'])
});

/**
 * Navigation saved before sorts were kept per list held one Browse sort. It becomes the home list's choice once;
 * absent, invalid or default values leave home on its default.
 */
export function readLegacyCompanionBrowseSort(value: string | null) {
  if (!value) return null;
  const result = legacyBrowseSort.safeParse(JSON.parse(value));
  if (!result.success) return null;
  const { browseSortKey: key, browseSortDirection: direction } = result.data;
  return key === 'dateSaved' && direction === 'desc' ? null : { direction, key };
}

export function restoreCompanionNavigation(value: string | null, snapshot: WorkspaceSnapshot | null) {
  if (!value) return initialCompanionNavigation(Boolean(snapshot));
  const result = navigationSchema.safeParse(JSON.parse(value));
  if (!result.success) throw new Error('Invalid saved companion navigation.');
  const state = result.data;
  if (!snapshot) return { ...initialCompanionNavigation(false), settingsPage: state.settingsPage };
  // Removed or no-longer-visible targets return to their own list, never enter Flow.
  const browsingTrash = state.isBrowseDirectoryOpen && ['trash', 'trashFolder'].includes(state.directorySelection.kind);
  const canRestore = (id: string) => isCanonicalVisibleNodeId(snapshot, id) ||
    (browsingTrash && isCanonicalTrashedNodeId(snapshot, id));
  if (state.selectedBrowseNodeId && !canRestore(state.selectedBrowseNodeId)) {
    state.selectedBrowseNodeId = null;
    state.searchTopicNodeId = null;
  }
  state.backlinkReturnNodeIds = state.selectedBrowseNodeId
    ? state.backlinkReturnNodeIds.filter(id => isCanonicalVisibleNodeId(snapshot, id)) : [];
  if (state.browseReturnNodeId && !isCanonicalVisibleNodeId(snapshot, state.browseReturnNodeId)) {
    state.browseReturnNodeId = null;
  }
  const selection = state.directorySelection;
  if ('nodeId' in selection && !(selection.kind === 'trashFolder'
    ? isCanonicalTrashedNodeId(snapshot, selection.nodeId) : isCanonicalVisibleNodeId(snapshot, selection.nodeId))) {
    state.directorySelection = { kind: 'root' };
  }
  return state;
}
