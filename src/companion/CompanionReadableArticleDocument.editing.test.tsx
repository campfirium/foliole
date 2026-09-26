import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { ReadableArticleDocument } from './CompanionReadableArticleDocument';

const markdownEditorMock = vi.hoisted(() => ({
  props: null as null | {
    ariaLabel?: string;
    onBlurCapture?: () => void;
    onChange: (content: string) => void;
    hideTitleHeading?: boolean;
    readOnly?: boolean;
    value: string;
  }
}));

const defaultReadingTypographySettings = {
  contrast: 'default',
  fontFamily: 'sans',
  fontSize: 'default',
  lineHeight: 'default'
} as const;

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

function renderReadableArticleDocument(props: Partial<Parameters<typeof ReadableArticleDocument>[0]> = {}) {
  return render(
    <ReadableArticleDocument
      readableArticle={createReadableArticle(props.readableArticle)}
      readingTypographySettings={defaultReadingTypographySettings}
      {...props}
    />
  );
}

describe('ReadableArticleDocument editing', () => {
  it('uses a selected device font for readable content', () => {
    const { container } = renderReadableArticleDocument({
      readingTypographySettings: { ...defaultReadingTypographySettings, fontFamily: 'system:Noto Sans SC' }
    });
    expect(container.querySelector('[data-reading-font-family]'))
      .toHaveStyle({ '--content-panel-font-family': '"Noto Sans SC", var(--font-family-sans)' });
  });

  it('keeps the document read-only when no save handler exists', () => {
    renderReadableArticleDocument();

    expect(screen.getByLabelText('Topic body')).toHaveAttribute('readonly');
  });

  it('keeps the document read-only until content editing is explicitly enabled', () => {
    const onSaveContent = createContentSaveMock();
    renderReadableArticleDocument({ onSaveContent });

    fireEvent.change(screen.getByLabelText('Topic body'), { target: { value: 'Edited body' } });
    fireEvent.blur(screen.getByLabelText('Topic body'));

    expect(screen.getByLabelText('Topic body')).toHaveAttribute('readonly');
    expect(onSaveContent).not.toHaveBeenCalled();
  });

  it('flushes explicitly editable content on blur through the save handler', () => {
    const onSaveContent = createContentSaveMock();
    renderReadableArticleDocument({ allowContentEditing: true, onSaveContent });

    expect(markdownEditorMock.props?.ariaLabel).toBe('Topic body');

    fireEvent.change(screen.getByLabelText('Topic body'), { target: { value: 'Edited body' } });
    expect(onSaveContent).not.toHaveBeenCalled();

    fireEvent.blur(screen.getByLabelText('Topic body'));

    expect(onSaveContent).toHaveBeenCalledWith('topic-1', 'Edited body', expect.objectContaining({ content: 'Edited body' }));
  });

  it('keeps the document read-only when content editing is disabled', () => {
    const onSaveContent = createContentSaveMock();
    renderReadableArticleDocument({ allowContentEditing: false, onSaveContent });

    fireEvent.change(screen.getByLabelText('Topic body'), { target: { value: 'Edited body' } });
    fireEvent.blur(screen.getByLabelText('Topic body'));

    expect(screen.getByLabelText('Topic body')).toHaveAttribute('readonly');
    expect(onSaveContent).not.toHaveBeenCalled();
  });

  it('keeps unavailable bodies out of editable mode', () => {
    renderReadableArticleDocument({ onSaveContent: createContentSaveMock(), readableArticle: createReadableArticle({ bodyStatus: 'missing' }) });

    expect(screen.queryByLabelText('Topic body')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for topic body.')).toBeInTheDocument();
  });

  it('keeps a legacy hidden body H1 available to the shared editor', () => {
    renderReadableArticleDocument({
      readableArticle: createReadableArticle({
        content: '# Article title\n\nBody',
        hideTitleHeading: true
      })
    });

    expect(screen.getByLabelText('Topic body')).toHaveValue('# Article title\n\nBody');
    expect(markdownEditorMock.props?.hideTitleHeading).toBe(true);
  });
});

it('ignores historical Readwise lifecycle values while rendering the same topic body', () => {
  renderReadableArticleDocument({
    readableArticle: createReadableArticle({
      readwiseRemoteLifecycle: {
        checkedAt: '2026-09-09T00:00:00.000Z',
        connectionRef: 'readwise-connection',
        export: 'deleted',
        reader: 'missing',
        scope: {
          readerLocation: 'all',
          version: 1
        }
      }
    })
  });

  expect(screen.getByLabelText('Topic body')).toHaveValue('Original body');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('keeps visible continued input through refresh, late acknowledgement, failure and retry', async () => {
  const save = createContentSaveMock();
  let confirm!: (value: { content: string; currentVersionId: string; submittedVersionId: string }) => void;
  save.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
  const renderDocument = (content: string) => <ReadableArticleDocument allowContentEditing
    onSaveContent={save} readableArticle={createReadableArticle({ content, currentVersionId: 'base' })}
    readingTypographySettings={defaultReadingTypographySettings} />;
  const view = render(renderDocument('Original body'));
  fireEvent.change(screen.getByLabelText('Topic body'), { target: { value: 'First input' } });
  fireEvent.blur(screen.getByLabelText('Topic body'));
  fireEvent.change(screen.getByLabelText('Topic body'), { target: { value: 'Continued input' } });
  view.rerender(renderDocument('Remote refresh'));
  expect(screen.getByLabelText('Topic body')).toHaveValue('Continued input');
  save.mockRejectedValueOnce(new Error('Temporary writer failure'));
  fireEvent.blur(screen.getByLabelText('Topic body'));
  const first = save.mock.calls[0]![2]!;
  await act(async () => { confirm({ content: 'Merged first', currentVersionId: 'merged', submittedVersionId: first.versionId }); });
  expect(await screen.findByText('Temporary writer failure')).toBeInTheDocument();
  expect(screen.getByLabelText('Topic body')).toHaveValue('Continued input');
  fireEvent.blur(screen.getByLabelText('Topic body'));
  await waitFor(() => expect(screen.queryByText('Temporary writer failure')).not.toBeInTheDocument());
  expect(save.mock.calls[2]![2]).toEqual(save.mock.calls[1]![2]);
  save.setSource({ content: 'Latest committed merge', versionId: 'latest' });
  view.rerender(renderDocument('Older source arriving last'));
  await waitFor(() => expect(screen.getByLabelText('Topic body')).toHaveValue('Latest committed merge'));
});
