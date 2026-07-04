import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReadableArticleDocument } from './CompanionReadableArticleDocument';

const markdownEditorMock = vi.hoisted(() => ({
  props: null as null | {
    onBlurCapture?: () => void;
    onChange: (content: string) => void;
    hideTitleHeading?: boolean;
    readOnly?: boolean;
    value: string;
  }
}));

vi.mock('@/features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: typeof markdownEditorMock.props) => {
    markdownEditorMock.props = props;
    return (
      <textarea
        aria-label="Topic body"
        onBlur={props?.onBlurCapture}
        onChange={(event) => props?.onChange(event.currentTarget.value)}
        readOnly={props?.readOnly}
        value={props?.value ?? ''}
      />
    );
  }
}));

function createReadableArticle(overrides: Partial<Parameters<typeof ReadableArticleDocument>[0]['readableArticle']> = {}) {
  return {
    content: 'Original body',
    hideTitleHeading: false,
    nodeId: 'topic-1',
    persistedNodeViewState: null,
    pdfAttachmentId: null,
    textAnchorDecorations: [],
    title: 'Topic',
    ...overrides
  };
}

describe('ReadableArticleDocument editing', () => {
  it('keeps the document read-only when no save handler exists', () => {
    render(<ReadableArticleDocument readableArticle={createReadableArticle()} />);

    expect(screen.getByLabelText('Topic body')).toHaveAttribute('readonly');
  });

  it('flushes editable content on blur through the save handler', () => {
    const onSaveContent = vi.fn(async () => undefined);
    render(<ReadableArticleDocument onSaveContent={onSaveContent} readableArticle={createReadableArticle()} />);

    fireEvent.change(screen.getByLabelText('Topic body'), { target: { value: 'Edited body' } });
    expect(onSaveContent).not.toHaveBeenCalled();

    fireEvent.blur(screen.getByLabelText('Topic body'));

    expect(onSaveContent).toHaveBeenCalledWith('topic-1', 'Edited body');
  });

  it('keeps the document read-only when content editing is disabled', () => {
    const onSaveContent = vi.fn(async () => undefined);
    render(
      <ReadableArticleDocument
        allowContentEditing={false}
        onSaveContent={onSaveContent}
        readableArticle={createReadableArticle()}
      />
    );

    fireEvent.change(screen.getByLabelText('Topic body'), { target: { value: 'Edited body' } });
    fireEvent.blur(screen.getByLabelText('Topic body'));

    expect(screen.getByLabelText('Topic body')).toHaveAttribute('readonly');
    expect(onSaveContent).not.toHaveBeenCalled();
  });

  it('keeps unavailable bodies out of editable mode', () => {
    render(
      <ReadableArticleDocument
        onSaveContent={vi.fn()}
        readableArticle={createReadableArticle({ bodyStatus: 'missing' })}
      />
    );

    expect(screen.queryByLabelText('Topic body')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for topic body.')).toBeInTheDocument();
  });

  it('keeps a legacy hidden body H1 available to the shared editor', () => {
    render(
      <ReadableArticleDocument
        readableArticle={createReadableArticle({
          content: '# Article title\n\nBody',
          hideTitleHeading: true
        })}
      />
    );

    expect(screen.getByLabelText('Topic body')).toHaveValue('# Article title\n\nBody');
    expect(markdownEditorMock.props?.hideTitleHeading).toBe(true);
  });
});
