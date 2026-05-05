import { Compartment } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

import { shouldAutoLocalizeRemoteImages } from '../model/remoteImageLocalizationSetting';

import { createLiveMarkdown } from './liveMarkdown';
import { localizeRemoteMarkdownImages } from './localizeRemoteMarkdownImages';

export interface CodeMirrorEditorAdapterOptions {
  hiddenTextAnchorKeys?: readonly string[];
  hideTitleHeading?: boolean;
  initialContent: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
}

export function createLiveMarkdownReconfigureEffect(args: {
  compartment: Compartment;
  hiddenTextAnchorKeys: readonly string[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
}) {
  return args.compartment.reconfigure(
    createLiveMarkdown(args.hideTitleHeading, args.nodeId, args.imageClozePresentationVersion, args.hiddenTextAnchorKeys)
  );
}

export function createEmptyDecorationsEffect(compartment: Compartment) {
  return compartment.reconfigure(EditorView.decorations.of(Decoration.none));
}

export class RemoteImageLocalizationController {
  private localizationRunId = 0;
  private localizationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly args: {
      applyLocalizedContent: (localized: string, contentSnapshot: string) => void;
      getContent: () => string;
      getNodeId: () => string | null;
    }
  ) {}

  destroy() {
    if (!this.localizationTimer) {
      return;
    }
    clearTimeout(this.localizationTimer);
    this.localizationTimer = null;
  }

  schedule() {
    this.destroy();
    const nodeId = this.args.getNodeId();
    if (!nodeId || !shouldAutoLocalizeRemoteImages()) {
      return;
    }

    const currentContent = this.args.getContent();
    if (!/!\[[^\]]*\]\((?:<)?https?:\/\//i.test(currentContent)) {
      return;
    }

    const runId = ++this.localizationRunId;
    this.localizationTimer = setTimeout(() => {
      this.localizationTimer = null;
      void this.run(runId, nodeId, currentContent);
    }, 180);
  }

  private async run(runId: number, nodeId: string, contentSnapshot: string) {
    if (runId !== this.localizationRunId || !shouldAutoLocalizeRemoteImages()) {
      return;
    }
    const localized = await localizeRemoteMarkdownImages(nodeId, contentSnapshot);
    if (runId !== this.localizationRunId || localized === contentSnapshot || this.args.getContent() !== contentSnapshot) {
      return;
    }
    this.args.applyLocalizedContent(localized, contentSnapshot);
  }
}
