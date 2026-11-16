import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { ImageFocusRect } from '../model/markdownImageFocus';
import { createMarkdownImageCropEdit } from '../model/markdownImageSize';
import type { MarkdownImageMatch } from '../model/markdownImageTypes';

import type { ImageClozeDraftController } from './imageClozeWidgetControls';
import { createImageClozeActionButton } from './imageClozeWidgetInteractionHelpers';
import { originalImageDraft } from './liveMarkdownImageCropFrame';
import { showImageRegionEditor } from './liveMarkdownImageRegionEditor';

const EDIT_CROP_EVENT = 'foliole:editor-edit-image-crop';
const CROP_ICON_PATH = 'M5 2v9h9M2 5h9v9';

function createCropButton(label: string, className: string, selection: () => ImageFocusRect | null, iconPath = CROP_ICON_PATH) {
  const button = createImageClozeActionButton({
    ariaLabel: label,
    iconPath,
    onClick: event => {
      event.preventDefault();
      event.stopPropagation();
      const rect = selection();
      if (rect) button.dispatchEvent(new CustomEvent(EDIT_CROP_EVENT, { detail: rect, bubbles: true }));
    }
  });
  button.title = label;
  button.classList.add(className);
  return button;
}

export function createImageCropDraftButton(args: { draft: ImageClozeDraftController; overlay: HTMLElement }) {
  return createCropButton(translate(getStoredAppLocale(), 'desktop.editor.image.crop'),
    'cm-md-image-crop-action', () => {
      const rect = args.draft.dragHandlers.getDraftRect();
      return rect && !args.draft.hasPendingRegions() ? originalImageDraft(args.overlay, rect) : null;
    });
}

export function createImageCropEditButton(crop: ImageFocusRect) {
  return createCropButton(translate(getStoredAppLocale(), 'desktop.editor.image.returnToOriginal'),
    'cm-md-image-crop-edit', () => crop, 'M2.5 3h11v10h-11zM3 11l3.1-3 2 2L10 8l3.4 3.3M10.8 5.5h.2');
}

function commitImageCrop(widget: HTMLElement, view: EditorView, crop: ImageFocusRect | null) {
  if (view.state.readOnly || !widget.isConnected) return;
  const from = Number(widget.dataset.mdImageFrom);
  const to = Number(widget.dataset.mdImageTo);
  const markdown = view.state.doc.toString();
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > markdown.length || from >= to) return;
  const edit = createMarkdownImageCropEdit({ imageRange: { from, to }, markdown, crop });
  if (edit && markdown.slice(edit.from, edit.to) !== edit.insert) {
    view.dispatch({ changes: edit, userEvent: 'input.image.crop', annotations: isolateHistory.of('full') });
  }
  view.focus();
}

export function enableMarkdownImageCrop(widget: HTMLElement, view: EditorView, match: MarkdownImageMatch) {
  if (!match.attachmentId || view.state.readOnly || match.focusEditable === false) return;
  if (view.state.sliceDoc(match.from, match.from + 3) === '![[') return;
  widget.dataset.mdImageCropEditable = 'true';
  widget.addEventListener(EDIT_CROP_EVENT, event => {
    if (view.state.readOnly || !widget.isConnected) return;
    const surface = widget.querySelector<HTMLElement>('.cm-md-image-surface');
    if (!surface) return;
    showImageRegionEditor({
      surface,
      kind: 'crop',
      requestMeasure: () => view.requestMeasure(),
      rect: (event as CustomEvent<ImageFocusRect>).detail,
      canRemove: Boolean(match.crop),
      onCommit: crop => commitImageCrop(widget, view, crop),
      trigger: event.target instanceof HTMLButtonElement ? event.target : null
    });
  });
}
