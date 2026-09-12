import {
  forgetRemoteImageLearnedSource,
  saveRemoteImageSourceWebsite,
  type RemoteImageSourceContextState
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
  onSourceContextChanged: () => void;
  requestMeasure: RequestEditorMeasure;
  sourceContext: RemoteImageSourceContextState;
}

export function createRemoteImageFailureStatus(options: RemoteImageFailureStatusOptions) {
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
        if (saved) options.onSourceContextChanged();
      });
    });
  };
  const forgetLearnedSource = () => {
    void forgetRemoteImageLearnedSource(options.imageMatch.source).then(() => {
      options.onSourceContextChanged();
    });
  };
  return createImageStatusElement('unavailable', options.imageMatch.display, {
    canRetryFromSource: Boolean(options.editorNodeId),
    onContextMenu: (event, anchor) => {
      openRemoteImageFailureContextMenu({
        anchor,
        canForgetLearnedSource: options.sourceContext.source === 'learned',
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
