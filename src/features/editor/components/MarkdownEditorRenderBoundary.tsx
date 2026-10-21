import React from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';

interface MarkdownEditorRenderBoundaryProps {
  children: React.ReactNode;
  nodeId: string | null;
  value: string;
}

interface MarkdownEditorRenderBoundaryState {
  message: string | null;
  nodeId: string | null;
}

function MarkdownEditorRenderFailure(props: { message: string; value: string }) {
  const t = useTranslation();
  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-auto p-6" role="alert">
      <p className="text-sm font-medium">{t('shared.editorRenderFailure.title')}</p>
      <p className="text-sm text-muted-foreground">{t('shared.editorRenderFailure.body')}</p>
      <p className="font-mono text-xs text-muted-foreground">{props.message}</p>
      <pre className="whitespace-pre-wrap break-words text-sm">{props.value}</pre>
    </div>
  );
}

// Contains editor render failures to the current document so one unrenderable topic
// cannot take down the whole workspace (and the restored active topic on every launch).
export class MarkdownEditorRenderBoundary extends React.Component<
  MarkdownEditorRenderBoundaryProps,
  MarkdownEditorRenderBoundaryState
> {
  override state: MarkdownEditorRenderBoundaryState = { message: null, nodeId: this.props.nodeId };

  static getDerivedStateFromError(error: unknown): Partial<MarkdownEditorRenderBoundaryState> {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  static getDerivedStateFromProps(
    props: MarkdownEditorRenderBoundaryProps,
    state: MarkdownEditorRenderBoundaryState
  ): Partial<MarkdownEditorRenderBoundaryState> | null {
    if (props.nodeId === state.nodeId) return null;
    return { message: null, nodeId: props.nodeId };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[editor] document render failed', { nodeId: this.props.nodeId, error, componentStack: info.componentStack });
  }

  override render() {
    if (this.state.message === null) return this.props.children;
    return <MarkdownEditorRenderFailure message={this.state.message} value={this.props.value} />;
  }
}
