import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type {
  NativeSourceManagementAction,
  NativeSourceManagementType
} from '../../lib/platform/nativeSourceManagementContract.js';
import { confirmSourceManagement, previewSourceManagement } from '../database/sourceManagement.js';

import { asString } from './commandParsers.js';

function input(args: Record<string, unknown>) {
  const action = asString(args.action, 'action') as NativeSourceManagementAction;
  if (action !== 'remove_source' && action !== 'replace_host') {
    throw new Error('source_management_action_invalid');
  }
  const sourceType = args.source_type === 'external' || args.source_type === 'watched'
    ? args.source_type as NativeSourceManagementType
    : null;
  return {
    action,
    ...(typeof args.host_name === 'string' ? { hostName: args.host_name } : {}),
    ...(typeof args.source_ref === 'string' ? { sourceRef: args.source_ref } : {}),
    ...(sourceType ? { sourceType } : {})
  };
}

export function handleSourceManagementCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.previewSourceManagement) return previewSourceManagement(input(args));
  if (command === NATIVE_COMMANDS.confirmSourceManagement) return confirmSourceManagement(input(args));
  return undefined;
}
