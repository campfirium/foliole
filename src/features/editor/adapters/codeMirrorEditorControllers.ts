import { RemoteImageLocalizationController } from './codeMirrorEditorAdapterSupport';
import {
  EditorExternalChangeBuffer
} from './editorExternalChangeBuffer';

export function createCodeMirrorEditorControllers(args: {
  applyLocalizedContent: (localized: string) => void;
  getContent: () => string;
  getNodeId: () => string | null;
  isApplyingExternalContent: () => boolean;
  onFlush: (content: string, nodeId: string | null) => void;
}) {
  return {
    externalChangeBuffer: new EditorExternalChangeBuffer({
      getCurrentContent: args.getContent,
      isApplyingExternalContent: args.isApplyingExternalContent,
      onFlush: args.onFlush
    }),
    remoteImageLocalization: new RemoteImageLocalizationController({
      applyLocalizedContent: args.applyLocalizedContent,
      getContent: args.getContent,
      getNodeId: args.getNodeId
    })
  };
}

export function createRemoteImageLocalizationController(args: {
  applyLocalizedContent: (localized: string) => void;
  getContent: () => string;
  getNodeId: () => string | null;
}) {
  return new RemoteImageLocalizationController(args);
}

export function createExternalChangeBuffer(args: {
  getCurrentContent: () => string;
  isApplyingExternalContent: () => boolean;
  onFlush: (content: string, nodeId: string | null) => void;
}) {
  return new EditorExternalChangeBuffer(args);
}
