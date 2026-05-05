import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { importLocalImageAttachment } from '../attachments/importLocalImageAttachment.js';
import { resolveAttachmentResource } from '../attachments/resourceResolver.js';

import { asString } from './commandParsers.js';

export function handleStorageAttachmentCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.importLocalImageAttachment) {
    return importLocalImageAttachment(
      asString(args.nodeId, 'nodeId'),
      asString(args.sourcePath, 'sourcePath')
    );
  }

  if (command === NATIVE_COMMANDS.resolveAttachmentResource) {
    return resolveAttachmentResource(asString(args.attachment_id, 'attachment_id'));
  }

  return undefined;
}
