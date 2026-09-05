import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorTextAnchorDecoration } from '../adapters/EditorAdapter';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import type { MarkdownEditorProps } from './markdownEditorTypes';

export function createMarkdownEditorAdapter(args: {
  applicationCutEnabled: boolean | undefined;
  debugId: string | undefined;
  hideTitleHeading: boolean;
  host: HTMLDivElement;
  initialContent: string;
  liveMarkdownEnabled: boolean | undefined;
  localDocumentPath?: string | null;
  onChange: MarkdownEditorProps['onChange'];
  onDocumentInput: MarkdownEditorProps['onDocumentInput'];
  onMissingAttachmentResource: MarkdownEditorProps['onMissingAttachmentResource'];
  onOpenExternalLink: ((request: ExternalLinkOpenRequest) => void) | undefined;
  onOpenNodeLink: ((title: string) => void) | undefined;
  onPreviewNodeLink: ((request: EditorNodeLinkPreviewRequest | null) => void) | undefined;
  onPastedAnchors: MarkdownEditorProps['onPastedAnchors'];
  onRedo: MarkdownEditorProps['onRedo'];
  onUndo: MarkdownEditorProps['onUndo'];
  readOnly: boolean | undefined;
  readOnlyInteractionMode: MarkdownEditorProps['readOnlyInteractionMode'];
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  trailingDivider: boolean | undefined;
}) {
  return new CodeMirrorEditorAdapter(args.host, {
    ...(args.applicationCutEnabled !== undefined ? { applicationCutEnabled: args.applicationCutEnabled } : {}),
    hideTitleHeading: args.hideTitleHeading,
    initialContent: args.initialContent,
    ...(args.liveMarkdownEnabled !== undefined ? { liveMarkdownEnabled: args.liveMarkdownEnabled } : {}),
    localDocumentPath: args.localDocumentPath ?? null,
    onChange: args.onChange,
    ...(args.onDocumentInput ? { onDocumentInput: args.onDocumentInput } : {}),
    ...(args.onMissingAttachmentResource ? { onMissingAttachmentResource: args.onMissingAttachmentResource } : {}),
    ...(args.onOpenExternalLink ? { onOpenExternalLink: args.onOpenExternalLink } : {}),
    ...(args.onOpenNodeLink ? { onOpenNodeLink: args.onOpenNodeLink } : {}),
    ...(args.onPreviewNodeLink ? { onPreviewNodeLink: args.onPreviewNodeLink } : {}),
    ...(args.onPastedAnchors ? { onPastedAnchors: args.onPastedAnchors } : {}),
    ...(args.onRedo ? { onRedo: args.onRedo } : {}),
    ...(args.onUndo ? { onUndo: args.onUndo } : {}),
    ...(args.readOnly !== undefined ? { readOnly: args.readOnly } : {}),
    ...(args.readOnlyInteractionMode !== undefined ? { readOnlyInteractionMode: args.readOnlyInteractionMode } : {}),
    textAnchorDecorations: args.textAnchorDecorations,
    ...(args.trailingDivider !== undefined ? { trailingDivider: args.trailingDivider } : {})
  });
}
