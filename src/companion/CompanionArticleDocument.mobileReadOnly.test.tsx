import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionArticleDocument } from './CompanionArticleDocument';

const markdownEditorMock = vi.hoisted(() => ({
  props: null as null | {
    readOnly?: boolean;
    readOnlyInteractionMode?: 'editor' | 'document';
  }
}));

vi.mock('@/features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: typeof markdownEditorMock.props) => {
    markdownEditorMock.props = props;
    return <div data-testid="markdown-editor" />;
  }
}));

it('uses document interaction mode while companion articles are read-only', () => {
  render(
    <CompanionArticleDocument
      content="Body"
      nodeId="topic-1"
    />
  );

  expect(markdownEditorMock.props).toMatchObject({
    readOnly: true,
    readOnlyInteractionMode: 'document'
  });
});

it('uses editor interaction mode only when companion article editing is enabled', () => {
  render(
    <CompanionArticleDocument
      content="Body"
      nodeId="topic-1"
      onChange={vi.fn()}
    />
  );

  expect(markdownEditorMock.props).toMatchObject({
    readOnly: false,
    readOnlyInteractionMode: 'editor'
  });
});
