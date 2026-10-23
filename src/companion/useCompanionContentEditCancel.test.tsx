import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import type { ContentEditRevertResult, ContentEditRound } from '../shared/platform/companion/editing/contentEditRound';
import { registerAppConfirmationHandler, type AppConfirmationOptions } from '../shared/ui/appConfirmation';

import { CompanionReadingActivity } from './companionReadingActivity';
import { useCompanionContentEditCancel } from './useCompanionContentEditCancel';

let unregister: (() => void) | null = null;
afterEach(() => { unregister?.(); unregister = null; });

function setup(round: { hasChanges(): boolean; revert(): Promise<ContentEditRevertResult> }, answers: boolean[]) {
  const prompts: AppConfirmationOptions[] = [];
  unregister = registerAppConfirmationHandler(async (options) => { prompts.push(options); return answers.shift() ?? false; });
  const activity = new CompanionReadingActivity('topic', () => undefined);
  activity.editRound = round as unknown as ContentEditRound;
  const finish = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <LocalizationProvider initialLanguagePreference="en">{children}</LocalizationProvider>;
  const { result } = renderHook(() => useCompanionContentEditCancel(activity, finish), { wrapper });
  return { cancel: () => act(() => result.current()), finish, prompts };
}

it('leaves editing without asking when the round has no changes', async () => {
  const revert = vi.fn();
  const { cancel, finish, prompts } = setup({ hasChanges: () => false, revert }, []);
  await cancel();
  expect(prompts).toHaveLength(0);
  expect(revert).not.toHaveBeenCalled();
  expect(finish).toHaveBeenCalledTimes(1);
});

it('keeps editing when the user declines to discard changes', async () => {
  const revert = vi.fn();
  const { cancel, finish, prompts } = setup({ hasChanges: () => true, revert }, [false]);
  await cancel();
  expect(prompts[0]?.title).toBe('Discard changes?');
  expect(revert).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
});

it('restores the entry content before leaving editing once the user confirms', async () => {
  const order: string[] = [];
  const revert = vi.fn(async () => { order.push('revert'); return 'reverted' as const; });
  const { cancel, finish } = setup({ hasChanges: () => true, revert }, [true]);
  finish.mockImplementation(() => order.push('finish'));
  await cancel();
  expect(order).toEqual(['revert', 'finish']);
});

it('explains and stays in editing when other devices changed the topic during the round', async () => {
  const { cancel, finish, prompts } = setup({ hasChanges: () => true, revert: async () => 'blocked' }, [true, true]);
  await cancel();
  expect(prompts.map((prompt) => prompt.title)).toEqual(['Discard changes?', "Can't discard changes"]);
  expect(prompts[1]?.cancelLabel).toBeNull();
  expect(finish).not.toHaveBeenCalled();
});

it('stays in editing when restoring fails so the error remains visible', async () => {
  const { cancel, finish } = setup({ hasChanges: () => true, revert: async () => { throw new Error('save failed'); } }, [true]);
  await cancel();
  expect(finish).not.toHaveBeenCalled();
});
