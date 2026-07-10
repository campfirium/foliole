import { PENDING_THREAD_KEY } from './workspaceRightSidebarAssistantPanelModel';

export function resetPendingAssistantConversation(
  dispatchCache: (action: { key: string; type: 'delete' }) => void,
  setMessageText: (text: string) => void,
  selectThreadId: (threadId: string | null) => void
) {
  dispatchCache({ key: PENDING_THREAD_KEY, type: 'delete' });
  setMessageText('');
  selectThreadId(null);
}
