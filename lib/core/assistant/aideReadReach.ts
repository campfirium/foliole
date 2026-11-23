import type { AideReadScopeKey } from './aideToolPermissionSettings.js';

export type AideReadScopes = Record<AideReadScopeKey, boolean>;

/** Where one material sits: its own chain to the root and the area that root belongs to. */
export interface AideMaterialPlacement {
  area: 'dive' | 'home' | 'virtual';
  baseTopicId: string | null;
  /** The material itself, then its parents up to the root. */
  chainIds: string[];
  id: string;
  rootId: string;
  rootIsFolder: boolean;
  /** The material or one of its parents is in the trash. */
  trashed: boolean;
}

/** An index or a Dive with the material ids it lists directly. */
export interface AideCollection {
  id: string;
  kind: 'dive' | 'index';
  memberIds: readonly string[];
}

/** What the current materials open up: their Base Topics, top-level folders, indexes and Dives. */
export interface AideReachContext {
  baseTopicIds: ReadonlySet<string>;
  diveIds: ReadonlySet<string>;
  diveSourceIds: ReadonlySet<string>;
  indexIds: ReadonlySet<string>;
  indexMemberIds: ReadonlySet<string>;
  linkedIds: ReadonlySet<string>;
  topFolderIds: ReadonlySet<string>;
}

export function buildAideReachContext(current: readonly AideMaterialPlacement[], collections: readonly AideCollection[]): AideReachContext {
  const chainIds = new Set(current.flatMap((placement) => placement.chainIds));
  const indexes = collections.filter((collection) => collection.kind === 'index' && collection.memberIds.some((id) => chainIds.has(id)));
  // A Dive can list a folder, so a material is in it when the Dive lists the material or any folder above it.
  const dives = collections.filter((collection) => collection.kind === 'dive' && collection.memberIds.some((id) => chainIds.has(id)));
  return {
    baseTopicIds: new Set(current.flatMap((placement) => placement.baseTopicId ? [placement.baseTopicId] : [])),
    diveIds: new Set(dives.map((dive) => dive.id)),
    diveSourceIds: new Set(dives.flatMap((dive) => dive.memberIds)),
    indexIds: new Set(indexes.map((index) => index.id)),
    indexMemberIds: new Set(indexes.flatMap((index) => index.memberIds)),
    linkedIds: new Set(current.map((placement) => placement.id)),
    topFolderIds: new Set(current.flatMap((placement) => placement.area === 'home' && placement.rootIsFolder ? [placement.rootId] : []))
  };
}

// Each switch opens one place; a material is readable when any switched-on place holds it.
export function isAideMaterialReachable(target: AideMaterialPlacement, context: AideReachContext, scopes: AideReadScopes) {
  if (scopes.current && context.linkedIds.has(target.id)) return true;
  if (target.trashed) return scopes.trash;
  if (scopes.baseTopic && target.chainIds.some((id) => context.baseTopicIds.has(id))) return true;
  if (scopes.folder && target.area === 'home' && context.topFolderIds.has(target.rootId)) return true;
  if (scopes.home && target.area === 'home') return true;
  if (scopes.virtual && (context.indexIds.has(target.id) || context.indexMemberIds.has(target.id))) return true;
  return scopes.dives && (context.diveIds.has(target.id) || target.chainIds.some((id) => context.diveSourceIds.has(id)));
}
