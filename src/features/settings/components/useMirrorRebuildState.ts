import { useState } from 'react';

import {
  rebuildRuntimeMirrorAttachmentLinks,
  rebuildRuntimeMirrorOutput,
  type RuntimeMirrorAttachmentLinkRebuildResult,
  type RuntimeMirrorOutputRebuildResult
} from '../../../shared/platform/libraryPathsBridge';

function formatMirrorOutputFeedback(result: RuntimeMirrorOutputRebuildResult) {
  const summary = `Rebuilt ${result.rebuiltArticleCount} mirror article files from ${result.queuedArticleCount} queued articles.`;
  if (result.failedArticleCount === 0 && result.pendingArticleCount === 0) {
    return summary;
  }
  return `${summary} ${result.failedArticleCount} failed, ${result.pendingArticleCount} still need retry.`;
}

function formatMirrorLinkFeedback(result: RuntimeMirrorAttachmentLinkRebuildResult) {
  if (result.rewrittenLinkCount > 0) {
    return `Rebuilt ${result.rewrittenLinkCount} mirror attachment links across ${result.rewrittenDocumentCount} documents.`;
  }
  return `Mirror attachment links are already up to date across ${result.scannedDocumentCount} documents.`;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message.trim() : null;
}

function createOutputErrorMessage(error: unknown) {
  return readErrorMessage(error)
    ? `Could not rebuild mirror article output. ${readErrorMessage(error)}`
    : 'Could not rebuild mirror article output. Article .md generation failed before link repair could run.';
}

function createLinkErrorMessage() {
  return 'Could not rebuild mirror attachment links. Existing article .md files were left as-is.';
}

function createResetState() {
  return {
    mirrorLinkRebuildError: null,
    mirrorLinkRebuildFeedback: null,
    mirrorOutputRebuildError: null,
    mirrorOutputRebuildFeedback: null
  };
}

export function useMirrorRebuildState() {
  const [isRebuildingMirrorLinks, setIsRebuildingMirrorLinks] = useState(false);
  const [isRebuildingMirrorOutput, setIsRebuildingMirrorOutput] = useState(false);
  const [mirrorLinkRebuildError, setMirrorLinkRebuildError] = useState<string | null>(null);
  const [mirrorLinkRebuildFeedback, setMirrorLinkRebuildFeedback] = useState<string | null>(null);
  const [mirrorOutputRebuildError, setMirrorOutputRebuildError] = useState<string | null>(null);
  const [mirrorOutputRebuildFeedback, setMirrorOutputRebuildFeedback] = useState<string | null>(null);

  function resetMirrorRebuildState() {
    const nextState = createResetState();
    setMirrorLinkRebuildError(nextState.mirrorLinkRebuildError);
    setMirrorLinkRebuildFeedback(nextState.mirrorLinkRebuildFeedback);
    setMirrorOutputRebuildError(nextState.mirrorOutputRebuildError);
    setMirrorOutputRebuildFeedback(nextState.mirrorOutputRebuildFeedback);
  }

  async function rebuildMirrorOutput() {
    resetMirrorRebuildState();
    setIsRebuildingMirrorOutput(true);
    try {
      const result = await rebuildRuntimeMirrorOutput();
      setMirrorOutputRebuildFeedback(formatMirrorOutputFeedback(result));
    } catch (error) {
      setMirrorOutputRebuildError(createOutputErrorMessage(error));
    } finally {
      setIsRebuildingMirrorOutput(false);
    }
  }

  async function rebuildMirrorLinks() {
    resetMirrorRebuildState();
    setIsRebuildingMirrorLinks(true);
    try {
      const result = await rebuildRuntimeMirrorAttachmentLinks();
      setMirrorLinkRebuildFeedback(formatMirrorLinkFeedback(result));
    } catch {
      setMirrorLinkRebuildError(createLinkErrorMessage());
    } finally {
      setIsRebuildingMirrorLinks(false);
    }
  }

  return {
    isRebuildingMirrorLinks,
    isRebuildingMirrorOutput,
    mirrorLinkRebuildError,
    mirrorLinkRebuildFeedback,
    mirrorOutputRebuildError,
    mirrorOutputRebuildFeedback,
    onRebuildMirrorLinks: rebuildMirrorLinks,
    onRebuildMirrorOutput: rebuildMirrorOutput,
    resetMirrorRebuildState
  };
}
