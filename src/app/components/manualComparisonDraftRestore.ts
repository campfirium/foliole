import type { MutableRefObject } from 'react';

import { loadManualComparisonDraft, saveManualComparisonDraft } from './manualComparisonDraftRepository';

interface RestoreManualComparisonDraftArgs {
  applyContent: (content: string) => void;
  contentRef?: MutableRefObject<string>;
  nodeId: string | null;
  requireEmpty?: boolean;
  restoreToken: number;
  restoreTokenRef: MutableRefObject<number>;
}

export function restoreManualComparisonDraft(args: RestoreManualComparisonDraftArgs) {
  void loadManualComparisonDraft(args.nodeId).then((content) => {
    if (args.restoreTokenRef.current !== args.restoreToken || !content) return;
    if (args.requireEmpty && args.contentRef?.current) return;
    args.applyContent(content);
  });
}

export function persistManualComparisonDraft(nodeId: string | null, content: string) {
  void saveManualComparisonDraft(nodeId, content);
}
