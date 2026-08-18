import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  disconnectWatchedFolderBinding,
  loadWatchedFolderBindingState,
  loadWatchedFolderBindings,
  removeWatchedFolderBinding
} from '../database/watchedFolderBindings.js';
import { confirmWatchedFolderReconnect, previewWatchedFolderReconnect } from '../import/watchedFolderReconnect.js';

import { asString } from './commandParsers.js';

export function handleWatchedFolderSettingsCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadWatchedFolderBindings) return loadWatchedFolderBindingState();
  if (command === NATIVE_COMMANDS.previewWatchedFolderReconnect) {
    return previewWatchedFolderReconnect(
      asString(args.binding_id, 'binding_id'), asString(args.folder_path, 'folder_path')
    );
  }
  if (command === NATIVE_COMMANDS.confirmWatchedFolderReconnect) {
    return confirmWatchedFolderReconnect({
      bindingId: asString(args.binding_id, 'binding_id'),
      folderPath: asString(args.folder_path, 'folder_path'),
      ...(typeof args.highlight_path === 'string' ? { highlightPath: args.highlight_path } : {})
    });
  }
  if (command === NATIVE_COMMANDS.disconnectWatchedFolder) {
    return disconnectWatchedFolderBinding(asString(args.binding_id, 'binding_id'));
  }
  if (command === NATIVE_COMMANDS.removeWatchedFolder) {
    removeWatchedFolderBinding(asString(args.binding_id, 'binding_id'));
    return loadWatchedFolderBindings();
  }
  return undefined;
}
