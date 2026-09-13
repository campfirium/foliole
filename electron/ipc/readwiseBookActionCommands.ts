import type { BrowserWindow } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resetReadwiseBookImport } from '../import/readwiseBookImportReset.js';
import { loadReadwiseBookEpub, openReadwiseBookDownload } from '../import/readwiseBookManualActions.js';
import {
  loadReadwiseOriginalEpubActionState,
  useReadwiseOriginalEpub
} from '../import/readwiseOriginalEpubAction.js';
import {
  loadReadwiseSourceResyncActionState,
  resyncReadwiseSource
} from '../import/readwiseSourceResyncAction.js';

import { asString } from './commandParsers.js';
import type { InvokeRequest } from './contracts.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export async function handleReadwiseBookActionCommand(
  request: InvokeRequest,
  args: Record<string, unknown>,
  window: BrowserWindow | null
) {
  const nodeId = () => asString(args.node_id, 'node_id');
  if (request.command === NATIVE_COMMANDS.openReadwiseBookDownload) return openReadwiseBookDownload(nodeId());
  if (request.command === NATIVE_COMMANDS.loadReadwiseOriginalEpubActionState) {
    return loadReadwiseOriginalEpubActionState(nodeId());
  }
  if (request.command === NATIVE_COMMANDS.loadReadwiseBookEpub) {
    const result = await loadReadwiseBookEpub(nodeId(), window);
    if (result.status === 'selected') notifyWorkspaceContentChanged();
    return result;
  }
  if (request.command === NATIVE_COMMANDS.useReadwiseOriginalEpub) {
    const result = await useReadwiseOriginalEpub(nodeId(), window);
    if (result.status === 'completed') notifyWorkspaceContentChanged();
    return result;
  }
  if (request.command === NATIVE_COMMANDS.loadReadwiseSourceResyncActionState) {
    return loadReadwiseSourceResyncActionState(nodeId());
  }
  if (request.command === NATIVE_COMMANDS.resyncReadwiseSource) {
    const result = await resyncReadwiseSource(nodeId());
    if (result.status === 'completed') notifyWorkspaceContentChanged();
    return result;
  }
  if (request.command === NATIVE_COMMANDS.resetReadwiseBookImport) {
    const result = await resetReadwiseBookImport(nodeId());
    if (result.status === 'reset') notifyWorkspaceContentChanged();
    return result;
  }
  return undefined;
}
