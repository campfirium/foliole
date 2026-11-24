import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { formatHighlightCardContent } from '../../../lib/core/annotations/textAnnotationContent';
import { buildCanonicalAssetMarkdownUrl } from '../../../lib/platform/assetMarkdownUrl';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import {
  cancelImageExcerptRegionSelection,
  IMAGE_EXCERPT_REGION_SELECTED_EVENT,
  type ImageExcerptRegionSelection
} from '../../features/editor/model/imageExcerptRegionSelection';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { AnnotationNotePanel } from './AnnotationNotePanel';
import { encodeImageExcerptBytes, hashImageExcerptBytes, renderImageExcerptCrop } from './imageExcerptCrop';

type PendingSelection = ImageExcerptRegionSelection & { originalText: string };
type CreateExcerpt = NonNullable<ReturnType<typeof useWorkspaceStore.getState>['createPdfImageExcerpt']>;

function resolvePanelPosition(selection: ImageExcerptRegionSelection) {
  return {
    left: Math.max(8, Math.min(selection.left - 120, window.innerWidth - 248)),
    top: Math.max(8, Math.min(selection.top + 8, window.innerHeight - 168))
  };
}

function usePendingImageExcerptSelection(props: {
  activeNodeId: string | null;
  editor: EditorAdapter | null;
  editorNodeId: string | null;
}) {
  const [pending, setPending] = useState<PendingSelection | null>(null);
  useEffect(() => {
    const onSelected = (event: Event) => {
      const selection = (event as CustomEvent<ImageExcerptRegionSelection>).detail;
      if (!props.activeNodeId || props.editorNodeId !== props.activeNodeId || !props.editor) return;
      const originalText = props.editor.getContent().slice(selection.imageRange.from, selection.imageRange.to);
      if (originalText.includes(`asset://${selection.attachmentId}`)) {
        setPending({ ...selection, originalText });
      }
    };
    window.addEventListener(IMAGE_EXCERPT_REGION_SELECTED_EVENT, onSelected);
    return () => window.removeEventListener(IMAGE_EXCERPT_REGION_SELECTED_EVENT, onSelected);
  }, [props.activeNodeId, props.editor, props.editorNodeId]);
  return { pending, setPending };
}

async function saveAnnotatedImageExcerpt(args: {
  createExcerpt: CreateExcerpt | undefined;
  editor: EditorAdapter;
  note: string;
  parentNodeId: string;
  pending: PendingSelection;
}) {
  const bytes = await renderImageExcerptCrop(args.pending.image, args.pending.rect);
  const attachmentId = await hashImageExcerptBytes(bytes);
  const imageContent = `![Image excerpt](${buildCanonicalAssetMarkdownUrl(attachmentId, 'image/png')})`;
  const content = formatHighlightCardContent({
    note: args.note,
    notePrefix: getHighlightAnnotationPrefix(),
    text: imageContent
  });
  return Boolean(await args.createExcerpt?.(
    args.parentNodeId,
    { ...args.pending.imageRange, originalText: args.pending.originalText },
    [{ attachmentId: args.pending.attachmentId, regions: [{ id: `region-${crypto.randomUUID()}`, ...args.pending.rect }] }],
    attachmentId,
    encodeImageExcerptBytes(bytes),
    content
  ));
}

function usePreviewAnnotationDismissal(
  previewSignal: AbortSignal | undefined,
  setPending: (value: null) => void,
  setDraft: (value: string) => void,
  setSaving: (value: boolean) => void
) {
  useEffect(() => {
    if (!previewSignal) return;
    const dismiss = () => {
      setDraft('');
      setPending(null);
      setSaving(false);
    };
    if (previewSignal.aborted) dismiss();
    else previewSignal.addEventListener('abort', dismiss, { once: true });
    return () => previewSignal.removeEventListener('abort', dismiss);
  }, [previewSignal, setPending, setDraft, setSaving]);
}

export function ImageExcerptAnnotationCreation(props: {
  activeNodeId: string | null;
  editor: EditorAdapter | null;
  editorNodeId: string | null;
}) {
  const createExcerpt = useWorkspaceStore((state) => state.createPdfImageExcerpt);
  const [draft, setDraft] = useState('');
  const selection = usePendingImageExcerptSelection(props);
  const pending = selection.pending;
  const [saving, setSaving] = useState(false);
  const close = () => {
    setDraft('');
    selection.setPending(null);
    setSaving(false);
    cancelImageExcerptRegionSelection();
  };
  useEffect(() => {
    setDraft('');
    selection.setPending(null);
    setSaving(false);
    cancelImageExcerptRegionSelection();
  }, [props.activeNodeId, props.editorNodeId]);
  const previewSignal = pending?.target?.signal;
  usePreviewAnnotationDismissal(previewSignal, selection.setPending, setDraft, setSaving);
  if (!pending || previewSignal?.aborted) return null;
  const position = resolvePanelPosition(pending);
  const save = async () => {
    const note = draft.trim();
    if (!note || saving || !props.activeNodeId || !props.editor) return;
    const currentText = props.editor.getContent().slice(pending.imageRange.from, pending.imageRange.to);
    if (currentText !== pending.originalText) return close();
    setSaving(true);
    try {
      const created = await saveAnnotatedImageExcerpt({
        createExcerpt,
        editor: props.editor,
        note,
        parentNodeId: props.activeNodeId,
        pending
      });
      if (created) close();
    } catch {
      // Keep the pending selection and note available for a safe retry.
    } finally {
      setSaving(false);
    }
  };
  const panel = (
    <AnnotationNotePanel
      draft={draft}
      left={position.left}
      onCancel={close}
      onChange={setDraft}
      onSave={() => void save()}
      saving={saving}
      top={position.top}
    />
  );
  return pending.target ? createPortal(panel, pending.target.host) : panel;
}
