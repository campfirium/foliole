import {
  forgetRemoteImageLearnedSource,
  loadRemoteImageSourceContext,
  saveRemoteImageSourceWebsite
} from '../../../shared/platform/remoteImageSourceRecovery';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import {
  dismissRemoteImageFailureHintForSession,
  dismissRemoteImageFailureHintPermanently,
  shouldShowRemoteImageFailureHint
} from '../model/remoteImageFailureHintSetting';

import {
  openRemoteImageFailureContextMenu
} from './liveMarkdownImageContextMenu';
import type { RequestEditorMeasure } from './liveMarkdownImageElement';
import { createImageStatusElement } from './liveMarkdownImageStatus';

interface RemoteImageFailureStatusOptions {
  editorNodeId: string | null;
  imageMatch: MarkdownImageMatch;
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
    const sourceWebsite = window.prompt('Source website');
    if (!sourceWebsite?.trim()) return;
    void saveRemoteImageSourceWebsite(options.imageMatch.source, sourceWebsite).then((saved) => {
      if (saved) options.onRetry();
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
        onRetry: options.onRetry,
        top: event.clientY
      });
    },
    onDismissHint: () => {
      dismissRemoteImageFailureHintForSession();
      options.requestMeasure?.();
    },
    onDismissHintPermanently: () => {
      dismissRemoteImageFailureHintPermanently();
      options.requestMeasure?.();
    },
    onRetry: options.onRetry,
    showRecoveryHint: shouldShowRemoteImageFailureHint()
  });
}
