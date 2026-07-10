import { useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

import { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';
import { WorkspaceRightSidebarAssistantConversation } from './WorkspaceRightSidebarAssistantConversation';
import {
  AssistantHomeIntro,
  AssistantPanelToolbar
} from './WorkspaceRightSidebarAssistantHeaders';
import { WorkspaceRightSidebarAssistantThreadList } from './WorkspaceRightSidebarAssistantThreadList';

export function FolioleAideReadyContent(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  nodesById: Record<string, Node>;
}) {
  const t = useTranslation();
  const [showHistory, setShowHistory] = useState(true);
  const conversationOpen = isConversationOpen(props.controller);
  return (
    <>
      <AssistantPanelToolbar
        conversationTitle={conversationOpen ? resolveConversationTitle(props.controller, t) : null}
        historyVisible={!conversationOpen && showHistory}
        onBack={props.controller.handleNewThread}
        onNewThread={props.controller.handleNewThread}
        onShowHistory={() => {
          if (conversationOpen) {
            props.controller.handleNewThread();
            setShowHistory(true);
          } else {
            setShowHistory((current) => !current);
          }
        }}
      />
      {conversationOpen ? <AssistantConversationView {...props} /> : (
      <AssistantHomeView
        {...props}
        historyVisible={showHistory}
      />
      )}
    </>
  );
}

function AssistantConversationView(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  nodesById: Record<string, Node>;
}) {
  const t = useTranslation();
  return (
    <>
      {props.controller.selectedThreadNotice ? (
        <p className={`${inspectorListInsetPaddingClassName} py-2 ${inspectorListMetaClassName}`}>
          {props.controller.selectedThreadNotice}
        </p>
      ) : null}
      <WorkspaceRightSidebarAssistantConversation
        activeMessages={props.controller.activeMessages}
        inputLabel={t('desktop.rightPanel.assistant.input')}
        messageText={props.controller.messageText}
        onEditMessage={props.controller.setMessageText}
        onMessageTextChange={props.controller.setMessageText}
        onSubmit={props.controller.handleSubmit}
        placeholder={t('desktop.rightPanel.assistant.placeholder')}
        pendingLabel={t('desktop.rightPanel.assistant.pending')}
        sendLabel={t('desktop.rightPanel.assistant.send')}
        sending={props.controller.sending}
        threadPreviewLabel={resolveThreadPreviewLabel(props.controller, t)}
        threadStatusLabel={resolveThreadStatusLabel(props.controller, t)}
      />
    </>
  );
}

function AssistantHomeView(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  historyVisible: boolean;
  nodesById: Record<string, Node>;
}) {
  const t = useTranslation();
  return (
    <div className="app-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto py-3">
      <AssistantHomeIntro />
      {props.historyVisible ? <AssistantHistoryList {...props} /> : null}
      <div className={`${inspectorListInsetPaddingClassName} mt-auto py-3`}>
        <WorkspaceRightSidebarAssistantComposer
          inputLabel={t('desktop.rightPanel.assistant.input')}
          messageText={props.controller.messageText}
          onMessageTextChange={props.controller.setMessageText}
          onSubmit={props.controller.handleSubmit}
          placeholder={t('desktop.rightPanel.assistant.placeholder')}
          sendLabel={t('desktop.rightPanel.assistant.send')}
          sending={props.controller.sending}
        />
      </div>
    </div>
  );
}

function AssistantHistoryList(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  nodesById: Record<string, Node>;
}) {
  return (
    <>
      <WorkspaceRightSidebarAssistantThreadList
        activeNodeId={props.activeNodeId}
        nodesById={props.nodesById}
        onRemoveRecord={props.controller.handleRemoveRecord}
        onSelectRecord={props.controller.handleSelectRecord}
        records={props.controller.records}
        removingThreadId={props.controller.removingThreadId}
        selectedThreadId={props.controller.selectedThreadId}
      />
      <AssistantThreadStatus
        empty={props.controller.records.length === 0}
        error={props.controller.threadError}
        loading={props.controller.loading}
        onRetry={props.controller.reloadThreads}
      />
    </>
  );
}

function AssistantThreadStatus(props: {
  empty: boolean;
  error: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>['threadError'];
  loading: boolean;
  onRetry: () => void;
}) {
  const t = useTranslation();
  const text = props.loading
    ? t('desktop.rightPanel.assistant.loading')
    : props.error === 'loadFailed'
      ? t('desktop.rightPanel.assistant.historyLoadFailed')
      : props.error === 'removeFailed'
        ? t('desktop.rightPanel.assistant.historyRemoveFailed')
    : props.empty
      ? t('desktop.rightPanel.assistant.empty')
      : null;
  if (!text) return null;
  return (
    <div className={`${inspectorListInsetPaddingClassName} flex items-center gap-2 py-3 ${inspectorListMetaClassName}`}>
      <span className="min-w-0 flex-1">{text}</span>
      {props.error === 'loadFailed' ? (
        <AppButton
          disabled={props.loading}
          onClick={props.onRetry}
          size="sm"
          type="button"
        >
          {t('desktop.rightPanel.assistant.retry')}
        </AppButton>
      ) : null}
    </div>
  );
}

function isConversationOpen(
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>
) {
  return controller.selectedThreadId !== null || controller.activeMessages.length > 0 || controller.sending;
}

function resolveConversationTitle(
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>,
  t: ReturnType<typeof useTranslation>
) {
  const title = controller.selectedRecord?.title.trim();
  if (title) return title;
  const firstPrompt = controller.activeMessages.find((message) => message.role === 'user')?.text.trim();
  return firstPrompt ? firstPrompt.slice(0, 80) : t('desktop.rightPanel.assistant.newConversation');
}

function resolveThreadPreviewLabel(
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>,
  t: ReturnType<typeof useTranslation>
) {
  if (controller.activeMessages.length > 0) return null;
  const preview = controller.selectedRecord?.preview.trim();
  return preview
    ? t('desktop.rightPanel.assistant.threadPreview', { preview })
    : null;
}

function resolveThreadStatusLabel(
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>,
  t: ReturnType<typeof useTranslation>
) {
  return controller.selectedRecord && controller.threadMessageStatus === 'failed'
    ? t('desktop.rightPanel.assistant.threadMessagesLoadFailed')
    : null;
}
