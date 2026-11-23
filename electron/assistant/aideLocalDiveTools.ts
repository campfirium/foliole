import type { Dive } from '../../lib/core/nodes/dive.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner, type SqliteDatabase } from '../database/connection.js';
import { addDiveSources, createDive, listDives, removeDiveSources, renameDive } from '../database/diveRepository.js';
import { notifyWorkspaceContentChanged } from '../ipc/workspaceContentChangedEvents.js';

import type { AideLocalToolHandler, AideLocalToolResult } from './aideLocalReadTools.js';

type DiveChange = (db: SqliteDatabase, args: Record<string, unknown>) => Dive;

const ids = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

export const AIDE_LOCAL_DIVE_TOOLS: Record<string, AideLocalToolHandler> = {
  add_dive_sources: changeDive((db, args) => addDiveSources(db, String(args.id), ids(args.source_ids))),
  create_dive: changeDive((db, args) => createDive(db, String(args.title), ids(args.source_ids))),
  list_dives: () => runWithDatabaseConnectionOwner(() => ({
    ok: true,
    payload: { dives: listDives(openDatabaseConnection().sqlite).map(describeDive) }
  })),
  remove_dive_sources: changeDive((db, args) => removeDiveSources(db, String(args.id), ids(args.source_ids))),
  rename_dive: changeDive((db, args) => renameDive(db, String(args.id), String(args.title)))
};

// Each change runs in one immediate transaction, so a refused change leaves nothing behind.
function changeDive(change: DiveChange): AideLocalToolHandler {
  return (args) => runWithDatabaseConnectionOwner((): AideLocalToolResult => {
    let dive: Dive;
    try {
      dive = change(openDatabaseConnection().sqlite, args);
    } catch (error) {
      return { ok: false, payload: { error: diveErrorCode(error) } };
    }
    notifyWorkspaceContentChanged(null, { workspaceScope: { kind: 'nodes', nodeIds: [dive.id] } });
    return { ok: true, payload: { dive: describeDive(dive) } };
  });
}

function describeDive(dive: Dive) {
  return { id: dive.id, source_ids: [...dive.directSourceIds], title: dive.title };
}

function diveErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Dive is unavailable') return 'dive_not_found';
  if (message === 'A Dive source is unavailable') return 'source_unavailable';
  if (message === 'Choose at least one Dive source') return 'source_required';
  if (message === 'Invalid Dive name') return 'invalid_title';
  return 'write_failed';
}
