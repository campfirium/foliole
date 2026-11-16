import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../../features/image-cloze/model/imageCloze';
import { buildImageClozeSourcePayload } from '../../features/image-cloze/model/imageCloze';
import {
  IMAGE_CLOZE_CREATE_EVENT,
  IMAGE_CLOZE_DELETE_EVENT,
  IMAGE_CLOZE_EDIT_EVENT,
  type ImageClozeEditEventDetail,
  type ImageClozeCreateEventDetail,
  type ImageClozeDeleteEventDetail
} from '../../features/image-cloze/model/imageClozeEvents';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { saveImageClozeRegionEdit } from '../../store/workspaceImageClozeRegionEdit';
import { drainPendingNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

export function useImageClozeEventBridge(args: {
  activeNode?: Node;
  activeNodeId: string | null;
  createImageClozeNodes: (
    parentNodeId: string,
    attachmentId: string,
    sourcePayload: ImageClozeSourcePayload,
    regions: ImageClozeDraftRegion[]
  ) => Promise<string[]> | string[];
  deleteImageClozeRegion: (parentNodeId: string, attachmentId: string, regionId: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushPendingEditorDraft: () => boolean;
  nodesById: Record<string, Node>;
}) {
  useEffect(() => {
    const handleImageClozeCreate = (event: Event) => {
      const detail = (event as CustomEvent<ImageClozeCreateEventDetail>).detail;
      if (!args.activeNodeId || !detail?.attachmentId) {
        return;
      }

      const sourcePayload = buildImageClozeSourcePayload(
        args.editorRef.current?.getContent() ?? args.activeNode?.content ?? '',
        detail.imageRange
      );
      if (sourcePayload) {
        args.flushPendingEditorDraft();
        args.createImageClozeNodes(args.activeNodeId, detail.attachmentId, sourcePayload, detail.regions);
      }
    };

    const handleImageClozeDelete = (event: Event) => {
      const detail = (event as CustomEvent<ImageClozeDeleteEventDetail>).detail;
      if (args.activeNodeId && detail?.attachmentId && detail?.regionId) {
        args.flushPendingEditorDraft();
        args.deleteImageClozeRegion(args.activeNodeId, detail.attachmentId, detail.regionId);
      }
    };

    const handleImageClozeEdit = (event: Event) => {
      const { detail } = event as CustomEvent<ImageClozeEditEventDetail>;
      const parentId = args.activeNodeId;
      if (!detail || !parentId) return;
      args.flushPendingEditorDraft();
      detail.respond(drainPendingNodeContentRuntimePersist(parentId).then(ready => ready && saveImageClozeRegionEdit(parentId, detail.edit)));
    };

    window.addEventListener(IMAGE_CLOZE_EDIT_EVENT, handleImageClozeEdit);
    window.addEventListener(IMAGE_CLOZE_CREATE_EVENT, handleImageClozeCreate as EventListener);
    window.addEventListener(IMAGE_CLOZE_DELETE_EVENT, handleImageClozeDelete as EventListener);
    return () => {
      window.removeEventListener(IMAGE_CLOZE_EDIT_EVENT, handleImageClozeEdit);
      window.removeEventListener(IMAGE_CLOZE_CREATE_EVENT, handleImageClozeCreate as EventListener);
      window.removeEventListener(IMAGE_CLOZE_DELETE_EVENT, handleImageClozeDelete as EventListener);
    };
  }, [args]);
}
