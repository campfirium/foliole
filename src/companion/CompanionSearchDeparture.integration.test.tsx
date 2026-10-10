import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import * as searchApi from '../shared/platform/companionFullTextSearch';

import { CompanionSearchContent } from './CompanionSearchContent';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: () => ({
    configureFramedSyncPayloadBudget: async () => {},
    closeFramedSyncPayloadBudget: async () => {}
  })
}));
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await library?.close();
  library = null;
});

it('ignores a pending topic open after leaving search while a current open still succeeds', async () => {
  library = await createSearchLibrary(1, 10);
  const onOpen = vi.fn();
  const view = renderWithLocalization(<CompanionSearchContent onOpenTopic={onOpen} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
  const topic = await screen.findByRole('button', { name: /000000/ });
  const available = searchApi.isCompanionSearchTopicAvailable;
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  let finished!: () => void;
  const completed = new Promise<void>((resolve) => { finished = resolve; });
  const read = vi.spyOn(searchApi, 'isCompanionSearchTopicAvailable').mockImplementationOnce(async (id) => {
    const result = await available(id);
    await waiting;
    finished();
    return result;
  });
  fireEvent.click(topic);
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => { finish(); await completed; });
  expect(onOpen).not.toHaveBeenCalled();
  renderWithLocalization(<CompanionSearchContent onOpenTopic={onOpen} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alpha' } });
  fireEvent.click(await screen.findByRole('button', { name: /000000/ }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ nodeId: '000000' }), 'alpha');
});
