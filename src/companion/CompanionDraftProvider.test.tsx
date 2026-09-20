import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { CompanionContentAcknowledgement } from '../shared/platform/companion/editing/companionContentEditContract';

import { createContentSaveMock, deferred } from './companionContentEditingTestSupport';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';

const lifecycle = vi.hoisted(() => ({ background: () => {}, foreground: () => {} }));
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async (handler: () => void) => { lifecycle.background = handler; return () => {}; },
  subscribeNativeAppForeground: async (handler: () => void) => { lifecycle.foreground = handler; return () => {}; }
}));

it('retains a failed detached draft until a foreground event confirms it', async () => {
  const save = createContentSaveMock();
  save.mockRejectedValueOnce(new Error('Writer unavailable'));
  function Editor() {
    const draft = useCompanionTopicEditAutosave({ canEdit: true, initialContent: 'Original body',
      initialVersionId: 'base', nodeId: 'topic', onSaveContent: save });
    return <textarea aria-label="Draft" value={draft.value} onChange={(event) => draft.handleChange(event.target.value)} />;
  }
  const view = render(<CompanionDraftProvider><Editor /></CompanionDraftProvider>);
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Retained input' } });
  view.rerender(<CompanionDraftProvider>{null}</CompanionDraftProvider>);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const first = save.mock.calls[0]![2];
  const gate = deferred<CompanionContentAcknowledgement>();
  save.mockImplementationOnce(() => gate.promise);
  act(() => { lifecycle.foreground(); lifecycle.background(); });
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]![2]).toEqual(first);
  view.rerender(<CompanionDraftProvider><Editor /></CompanionDraftProvider>);
  expect(screen.getByLabelText('Draft')).toHaveValue('Retained input');
  await act(async () => {
    save.setSource({ content: 'Retained input', versionId: first!.versionId });
    gate.resolve({ content: 'Retained input', currentVersionId: first!.versionId, submittedVersionId: first!.versionId });
  });
  expect(screen.getByLabelText('Draft')).toHaveValue('Retained input');
});
