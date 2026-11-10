import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { openDatabaseConnection } from '../database/connection.js';
import { convertDiveDirectory } from '../database/diveConversion.js';
import { addDiveSources, createDive, listDives, removeDiveSource, renameDive } from '../database/diveRepository.js';

import { asString, asStringArray } from './commandParsers.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export function handleDiveCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.convertDiveDirectory) {
    const target = args.target;
    if (target !== 'dive' && target !== 'index') throw new Error('Invalid directory conversion target');
    const matched = args.matchedTopics;
    if (matched !== undefined && (typeof matched !== 'object' || matched === null || !('filter' in matched) || !('ids' in matched))) {
      throw new Error('Invalid index results');
    }
    const matchedTopics = matched === undefined ? undefined
      : { filter: asString(matched.filter, 'filter'), ids: asStringArray(matched.ids, 'ids') };
    const nodeId = convertDiveDirectory(openDatabaseConnection().sqlite, asString(args.nodeId, 'nodeId'), target, matchedTopics);
    notifyWorkspaceContentChanged(null, { workspaceScope: { kind: 'nodes', nodeIds: [nodeId], structure: true } });
    return nodeId;
  }
  if (command === NATIVE_COMMANDS.renameDive || command === NATIVE_COMMANDS.removeDiveSource) {
    const { sqlite } = openDatabaseConnection();
    const diveId = asString(args.diveId, 'diveId');
    const dive = command === NATIVE_COMMANDS.renameDive
      ? renameDive(sqlite, diveId, asString(args.title, 'title'))
      : removeDiveSource(sqlite, diveId, asString(args.sourceId, 'sourceId'));
    notifyWorkspaceContentChanged(null, { workspaceScope: { kind: 'nodes', nodeIds: [dive.id] } });
    return dive;
  }
  if (command === NATIVE_COMMANDS.listDives) return listDives(openDatabaseConnection().sqlite);
  if (command === NATIVE_COMMANDS.createDive || command === NATIVE_COMMANDS.addDiveSources) {
    const ids = asStringArray(args.sourceIds, 'sourceIds');
    const { sqlite } = openDatabaseConnection();
    const dive = command === NATIVE_COMMANDS.createDive
      ? createDive(sqlite, asString(args.title, 'title'), ids)
      : addDiveSources(sqlite, asString(args.diveId, 'diveId'), ids);
    notifyWorkspaceContentChanged(null, { workspaceScope: { kind: 'nodes', nodeIds: [dive.id] } });
    return dive;
  }
}
