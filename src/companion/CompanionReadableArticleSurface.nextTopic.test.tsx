import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import { CompanionNextTopicFooter } from './CompanionNextTopicFooter';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

it.each(['Done', 'Cancel'])('hides the next topic while editing and restores it after %s', async exit => {
  const next = vi.fn();
  renderWithLocalization(<MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle onExit={vi.fn()} snapshot={null}
      onSaveArticleContent={createContentSaveMock({ content: 'Baseline', versionId: 'base' })}
      footer={<CompanionNextTopicFooter onOpen={next} />}
      readableArticle={{ content: 'Baseline', hideTitleHeading: false,
        nodeId: 'editing-topic', persistedNodeViewState: null, pdfAttachmentId: null,
        textAnchorDecorations: [], title: 'Topic' }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>);
  const body = await screen.findByText('Baseline');
  expect(screen.getByRole('button', { name: 'Next topic' })).toBeVisible();
  fireEvent.click(body);
  fireEvent.click(screen.getByRole('button', { name: 'Edit content' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Topic body' })).toHaveAttribute('contenteditable', 'true'));
  expect(screen.queryByRole('button', { name: 'Next topic' })).not.toBeInTheDocument();
  expect(next).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: exit }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next topic' })).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: 'Next topic' }));
  expect(next).toHaveBeenCalledOnce();
});
