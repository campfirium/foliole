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
import { createAssistantContinuationEvent } from './workspaceRightSidebarAssistantContinuation';
import { WorkspaceRightSidebarAssistantConversation } from './WorkspaceRightSidebarAssistantConversation';
import { AssistantPanelToolbar } from './WorkspaceRightSidebarAssistantHeaders';
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
  const continuation = createAssistantContinuationEvent({
    onSelectRecord: props.controller.handleSelectRecord,
    records: props.controller.records,
    selectedRecord: props.controller.selectedRecord,
    t
  });
  return (
    <>
      {props.controller.selectedThreadNotice ? (
        <p className={`${inspectorListInsetPaddingClassName} py-2 ${inspectorListMetaClassName}`}>
          {props.controller.selectedThreadNotice}
        </p>
      ) : null}
      <WorkspaceRightSidebarAssistantConversation
        activeMessages={props.controller.activeMessages}
        contextFollowDescription={t('desktop.rightPanel.assistant.followCurrentMaterialDescription')}
        contextFollowEnabled={props.controller.followCurrentMaterial}
        contextFollowLabel={resolveContextFollowLabel(props, t)}
        inputLabel={t('desktop.rightPanel.assistant.input')}
        messageText={props.controller.messageText}
        onEditMessage={props.controller.setMessageText}
        onMessageTextChange={props.controller.setMessageText}
        onToggleContextFollow={() => props.controller.setFollowCurrentMaterial(!props.controller.followCurrentMaterial)}
        onSubmit={props.controller.handleSubmit}
        placeholder={t('desktop.rightPanel.assistant.placeholder')}
        pendingLabel={t('desktop.rightPanel.assistant.pending')}
        sendLabel={t('desktop.rightPanel.assistant.send')}
        sending={props.controller.sending}
        statusLabel={resolveThreadLoadStatusLabel(props.controller, t)}
        transitionEvent={continuation}
        threadPreviewLabel={resolveThreadPreviewLabel(props.controller, t)}
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto py-3">
        {props.historyVisible ? <AssistantHistoryList {...props} /> : null}
      </div>
      <div className={`${inspectorListInsetPaddingClassName} shrink-0 pb-3 pt-2`}>
        <WorkspaceRightSidebarAssistantComposer
          contextFollowDescription={t('desktop.rightPanel.assistant.followCurrentMaterialDescription')}
          contextFollowEnabled={props.controller.followCurrentMaterial}
          contextFollowLabel={resolveContextFollowLabel(props, t)}
          inputLabel={t('desktop.rightPanel.assistant.input')}
          messageText={props.controller.messageText}
          onMessageTextChange={props.controller.setMessageText}
          onToggleContextFollow={() => props.controller.setFollowCurrentMaterial(!props.controller.followCurrentMaterial)}
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

function resolveThreadLoadStatusLabel(
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>,
  t: ReturnType<typeof useTranslation>
) {
  return controller.selectedRecord && controller.threadMessageStatus === 'failed'
    ? t('desktop.rightPanel.assistant.threadMessagesLoadFailed')
    : null;
}

function resolveContextFollowLabel(
  props: Pick<Parameters<typeof FolioleAideReadyContent>[0], 'activeNodeId' | 'controller' | 'nodesById'>,
  t: ReturnType<typeof useTranslation>
) {
  if (!props.controller.followCurrentMaterial)
    return t('desktop.rightPanel.assistant.followCurrentMaterial');
  const title = props.activeNodeId ? props.nodesById[props.activeNodeId]?.title.trim() : '';
  return t('desktop.rightPanel.assistant.followingCurrentMaterial', {
    title: title || t('desktop.rightPanel.assistant.location.workspace')
  });
}
