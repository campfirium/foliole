import {
  forgetRemoteImageLearnedSource,
  loadRemoteImageSourceContext,
  saveRemoteImageSourceWebsite
} from '../../../shared/platform/remoteImageSourceRecovery';
import { getDemoRuntimeState } from '../../../shared/platform/runtime/demoRuntime';
import { requestAppTextInput } from '../../../shared/ui';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import {
  openRemoteImageFailureContextMenu
} from './liveMarkdownImageContextMenu';
import type { RequestEditorMeasure } from './liveMarkdownImageElement';
import { createImageStatusElement } from './liveMarkdownImageStatus';

interface RemoteImageFailureStatusOptions {
  editorNodeId: string | null;
  imageMatch: MarkdownImageMatch;
  onRemoveImage?: (() => void) | null;
  onRetry: () => void;
  requestMeasure: RequestEditorMeasure;
}

export function createRemoteImageFailureStatus(options: RemoteImageFailureStatusOptions) {
  let usesLearnedSource = false;
  void loadRemoteImageSourceContext(options.imageMatch.source, options.editorNodeId)
    .then((context) => {
      usesLearnedSource = context.source === 'learned';
    })
    .catch(() => undefined);
  const provideSourceWebsite = () => {
    void requestAppTextInput({
      confirmLabel: 'Save source',
      description: 'Foliole will use this page to retry images from the same source.',
      inputLabel: 'Source website',
      placeholder: 'https://example.com/article',
      title: 'Add source website'
    }).then((sourceWebsite) => {
      if (!sourceWebsite?.trim()) return;
      void saveRemoteImageSourceWebsite(options.imageMatch.source, sourceWebsite).then((saved) => {
        if (saved) options.onRetry();
      });
    });
  };
  const forgetLearnedSource = () => {
    void forgetRemoteImageLearnedSource(options.imageMatch.source).then(() => {
      usesLearnedSource = false;
      options.onRetry();
    });
  };
  return createImageStatusElement('unavailable', options.imageMatch.display, {
    canRetryFromSource: Boolean(options.editorNodeId),
    onContextMenu: (event, anchor) => {
      openRemoteImageFailureContextMenu({
        anchor,
        canForgetLearnedSource: usesLearnedSource,
        left: event.clientX,
        onForgetLearnedSource: forgetLearnedSource,
        onProvideSourceWebsite: provideSourceWebsite,
        onRemoveImage: options.onRemoveImage ?? null,
        onRetry: options.onRetry,
        top: event.clientY
      });
    },
    onProvideSourceWebsite: provideSourceWebsite,
    onRemoveImage: options.onRemoveImage ?? null,
    onRetry: options.onRetry,
    sourceUrl: options.imageMatch.source,
    unavailableCopy: getDemoRuntimeState().isDemo ? 'demo' : 'default'
  });
}
