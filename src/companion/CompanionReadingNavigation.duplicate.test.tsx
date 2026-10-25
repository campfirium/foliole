import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CompanionNextTopicFooter } from './CompanionNextTopicFooter';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: () => <p>Topic body</p>
}));

const article = { nodeId: 'topic', content: 'Body', title: 'Topic', hideTitleHeading: false,
  textAnchorDecorations: [], persistedNodeViewState: null, pdfAttachmentId: null, currentVersionId: 'base' };

it('keeps a single footer after reading chrome updates and removes it when the target disappears', () => {
  function reader(hasNext: boolean) {
    return <ImmersiveReadableArticle readableArticle={article} snapshot={null} onExit={() => {}}
      footer={hasNext ? <CompanionNextTopicFooter key={article.nodeId} onOpen={() => {}} /> : null} />;
  }
  const view = render(reader(true));
  const surface = view.container.querySelector('section')!;
  for (let index = 0; index < 4; index += 1) {
    fireEvent.click(surface);
    expect(screen.getAllByRole('button', { name: 'Next topic' })).toHaveLength(1);
  }
  view.rerender(reader(false));
  expect(screen.queryByRole('button', { name: 'Next topic' })).not.toBeInTheDocument();
});
