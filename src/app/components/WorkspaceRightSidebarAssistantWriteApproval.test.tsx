import { act, fireEvent, renderHook, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeAssistantTurnEvent, NativeAssistantWriteChange } from '../../../lib/platform/nativeAssistantContract';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { useAssistantWriteApproval } from './useAssistantWriteApproval';
import { WorkspaceRightSidebarAssistantWriteApproval } from './WorkspaceRightSidebarAssistantWriteApproval';

const runtime = vi.hoisted(() => ({
  handlers: [] as Array<(event: NativeAssistantTurnEvent) => void>,
  resolveAssistantWriteApproval: vi.fn(async () => ({ resolved: true }))
}));

vi.mock('../../shared/platform/assistantRuntime', () => ({
  resolveAssistantWriteApproval: runtime.resolveAssistantWriteApproval,
  subscribeAssistantTurnEvents: (handler: (event: NativeAssistantTurnEvent) => void) => {
    runtime.handlers.push(handler);
    return () => { runtime.handlers = runtime.handlers.filter((item) => item !== handler); };
  }
}));

const approval = {
  changes: [
    { details: [{ field: 'parent' as const, value: '' }], target: 'Draft', tool: 'move_material' },
    { details: [{ field: 'materials' as const, value: 'Book A' }, { field: 'materials' as const, value: 'Book B' }], target: 'Economics', tool: 'create_dive' }
  ],
  id: 'approval-1'
};

beforeEach(() => {
  runtime.handlers = [];
  runtime.resolveAssistantWriteApproval.mockClear();
});

it('lists every change in the batch in plain words and answers once', () => {
  const onResolve = vi.fn();
  renderWithLocalization(<WorkspaceRightSidebarAssistantWriteApproval approval={approval} onResolve={onResolve} />);
  const card = screen.getByRole('region', { name: 'Aide wants to make these changes' });
  expect(within(card).getByText('Move')).toBeInTheDocument();
  expect(within(card).getByText('To: Library root')).toBeInTheDocument();
  expect(within(card).getByText('Create a Dive')).toBeInTheDocument();
  expect(within(card).getByText('Materials: Book A, Book B')).toBeInTheDocument();
  fireEvent.click(within(card).getByRole('button', { name: 'Allow' }));
  expect(onResolve).toHaveBeenCalledWith(true);
});

it('shows the request for the current reply only and clears it once answered or when the reply ends', () => {
  const activeTurnRef = { current: { clientTurnId: 'turn-1', prompt: '', provider: 'codex-app-server' as const, responseText: '', threadKey: 'k' } };
  const { rerender, result } = renderHook(({ sending }) => useAssistantWriteApproval(activeTurnRef, sending), { initialProps: { sending: true } });
  const emit = (event: Partial<NativeAssistantTurnEvent>) => act(() => runtime.handlers.forEach((handler) => handler({
    clientTurnId: 'turn-1', kind: 'approval_requested', provider: 'codex-app-server', ...event
  } as NativeAssistantTurnEvent)));
  emit({ approval, clientTurnId: 'other-turn' });
  expect(result.current.approval).toBeNull();
  emit({ approval });
  expect(result.current.approval).toEqual(approval);
  act(() => result.current.resolve(false));
  expect(runtime.resolveAssistantWriteApproval).toHaveBeenCalledWith('approval-1', false);
  expect(result.current.approval).toBeNull();
  emit({ approval });
  rerender({ sending: false });
  expect(result.current.approval).toBeNull();
});

it('removes only the approval cancelled by a library change while the reply is still active', () => {
  const activeTurnRef = { current: { clientTurnId: 'turn-1', prompt: '', provider: 'codex-app-server' as const, responseText: '', threadKey: 'k' } };
  const { result } = renderHook(() => useAssistantWriteApproval(activeTurnRef, true));
  const emit = (event: NativeAssistantTurnEvent) => act(() => runtime.handlers.forEach((handler) => handler(event)));
  const turn = { clientTurnId: 'turn-1', provider: 'codex-app-server' } as const;
  emit({ ...turn, approval, kind: 'approval_requested' });
  emit({ ...turn, approvalId: 'older', kind: 'approval_cancelled' });
  expect(result.current.approval).toEqual(approval);
  emit({ ...turn, approvalId: approval.id, kind: 'approval_cancelled' });
  expect(result.current.approval).toBeNull();
  expect(runtime.resolveAssistantWriteApproval).not.toHaveBeenCalled();
});

it('shows the question and answer independently and labels an explicit body clear', () => {
  const changes: NativeAssistantWriteChange[] = [{
    details: [{ field: 'question', value: 'New question' }, { field: 'answer', value: 'New answer' }],
    target: 'Item', tool: 'update_material'
  }, {
    details: [{ field: 'title', value: 'New topic title' }, { field: 'content', value: '' }],
    target: 'Topic', tool: 'update_material'
  }];
  renderWithLocalization(<WorkspaceRightSidebarAssistantWriteApproval
    approval={{ id: 'approval-2', changes }}
    onResolve={vi.fn()}
  />);
  const card = screen.getByRole('region', { name: 'Aide wants to make these changes' });
  expect(within(card).getByText('Question: New question')).toBeInTheDocument();
  expect(within(card).getByText('Answer: New answer')).toBeInTheDocument();
  expect(within(card).getByText('New title: New topic title')).toBeInTheDocument();
  expect(within(card).getByText('Content: Clear')).toBeInTheDocument();
});
