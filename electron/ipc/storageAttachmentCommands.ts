import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { copyAttachmentImageToClipboard, exportAttachmentImage } from '../attachments/attachmentImageActions.js';
import { importClipboardImageAttachment } from '../attachments/importClipboardImageAttachment.js';
import { importLocalImageAttachment } from '../attachments/importLocalImageAttachment.js';
import { importRemoteImageAttachment } from '../attachments/importRemoteImageAttachment.js';
import {
  forgetRemoteImageLearnedSource,
  learnRemoteImageSourceOrigin
} from '../attachments/remoteImageLearnedSources.js';
import { fetchRemoteImageMetadata } from '../attachments/remoteImagePipeline.js';
import { resolveRemoteImageSourceContext } from '../attachments/remoteImageSourceContext.js';
import { resolveAttachmentResource } from '../attachments/resourceResolver.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { asBoolean, asString } from './commandParsers.js';

function handleRemoteImageSourceCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadRemoteImageMetadata) {
    const sourceUrl = asString(args.source_url, 'source_url');
    const nodeId = typeof args.node_id === 'string' ? args.node_id : null;
    return runWithDatabaseConnectionOwner(() => resolveRemoteImageSourceContext(nodeId, sourceUrl))
      .then((context) => fetchRemoteImageMetadata(sourceUrl, {
        bypassFailureCache: args.bypass_failure_cache === undefined
          ? false
          : asBoolean(args.bypass_failure_cache, 'bypass_failure_cache'),
        sourceOrigin: context.sourceOrigin
      }))
      .then((intrinsicSize) => ({ intrinsic_size: intrinsicSize }));
  }
  if (command === NATIVE_COMMANDS.loadRemoteImageSourceContext) {
    const context = resolveRemoteImageSourceContext(
      typeof args.node_id === 'string' ? args.node_id : null,
      asString(args.source_url, 'source_url')
    );
    return {
      image_host: context.imageHost,
      learned_source_origin: context.learnedSourceOrigin,
      source: context.source,
      source_origin: context.sourceOrigin
    };
  }
  if (command === NATIVE_COMMANDS.saveRemoteImageSourceOrigin) {
    const result = learnRemoteImageSourceOrigin(
      asString(args.source_url, 'source_url'),
      asString(args.source_website, 'source_website')
    );
    return {
      image_host: result.imageHost,
      source_origin: result.sourceOrigin,
      status: result.status
    };
  }
  if (command === NATIVE_COMMANDS.forgetRemoteImageLearnedSource) {
    const result = forgetRemoteImageLearnedSource(asString(args.source_url, 'source_url'));
    return {
      image_host: result.imageHost,
      status: result.status
    };
  }
  return undefined;
}

export function handleStorageAttachmentCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof exportAttachmentImage>[1] = null
) {
  if (command === NATIVE_COMMANDS.importClipboardImageAttachment) {
    return importClipboardImageAttachment({
      bytesBase64: asString(args.bytesBase64, 'bytesBase64'),
      mimeType: asString(args.mimeType, 'mimeType'),
      nodeId: asString(args.nodeId, 'nodeId'),
      ...(typeof args.originalName === 'string' ? { originalName: args.originalName } : {})
    });
  }

  if (command === NATIVE_COMMANDS.importLocalImageAttachment) {
    return importLocalImageAttachment(
      asString(args.nodeId, 'nodeId'),
      asString(args.sourcePath, 'sourcePath')
    );
  }

  if (command === NATIVE_COMMANDS.importRemoteImageAttachment) {
    return importRemoteImageAttachment({
      nodeId: asString(args.nodeId, 'nodeId'),
      ...(typeof args.sourceOrigin === 'string' ? { sourceOrigin: args.sourceOrigin } : {}),
      sourceUrl: asString(args.sourceUrl, 'sourceUrl')
    });
  }

  const remoteImageSourceResult = handleRemoteImageSourceCommand(command, args);
  if (remoteImageSourceResult !== undefined) {
    return remoteImageSourceResult;
  }

  if (command === NATIVE_COMMANDS.resolveAttachmentResource) {
    const storageKey = asString(args.storage_key, 'storage_key');
    if (!parseCanonicalAttachmentStorageKey(storageKey)) {
      throw new Error('invalid argument: attachment resource description');
    }
    return resolveAttachmentResource(storageKey);
  }

  if (command === NATIVE_COMMANDS.copyAttachmentImageToClipboard) {
    return copyAttachmentImageToClipboard(asString(args.attachment_id, 'attachment_id'));
  }

  if (command === NATIVE_COMMANDS.exportAttachmentImage) {
    return exportAttachmentImage(asString(args.attachment_id, 'attachment_id'), window);
  }

  return undefined;
}
