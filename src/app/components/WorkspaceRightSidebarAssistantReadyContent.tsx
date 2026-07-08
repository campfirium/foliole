import { useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

import { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';
import { WorkspaceRightSidebarAssistantConversation } from './WorkspaceRightSidebarAssistantConversation';
import { AssistantConversationHeader, AssistantHomeHeader } from './WorkspaceRightSidebarAssistantHeaders';
import { WorkspaceRightSidebarAssistantThreadList } from './WorkspaceRightSidebarAssistantThreadList';

export function FolioleAideReadyContent(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  nodesById: Record<string, Node>;
}) {
  const [showHistory, setShowHistory] = useState(true);
  return isConversationOpen(props.controller)
    ? <AssistantConversationView {...props} />
    : (
      <AssistantHomeView
        {...props}
        historyVisible={showHistory}
        onToggleHistory={() => setShowHistory((current) => !current)}
      />
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
      <AssistantConversationHeader
        onBack={props.controller.handleNewThread}
        onNewThread={props.controller.handleNewThread}
        title={props.controller.selectedRecord?.title ?? t('desktop.rightPanel.assistant.newConversation')}
      />
      {props.controller.selectedThreadNotice ? (
        <p className={`${inspectorListInsetPaddingClassName} py-2 ${inspectorListMetaClassName}`}>
          {props.controller.selectedThreadNotice}
        </p>
      ) : null}
      <WorkspaceRightSidebarAssistantConversation
        activeMessages={props.controller.activeMessages}
        inputLabel={t('desktop.rightPanel.assistant.input')}
        messageText={props.controller.messageText}
        onMessageTextChange={props.controller.setMessageText}
        onSubmit={props.controller.handleSubmit}
        placeholder={t('desktop.rightPanel.assistant.placeholder')}
        sendLabel={t('desktop.rightPanel.assistant.send')}
        sending={props.controller.sending}
        sessionLabel={resolveSessionLabel(props.controller, t)}
      />
    </>
  );
}

function AssistantHomeView(props: {
  activeNodeId: string | null;
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
  historyVisible: boolean;
  nodesById: Record<string, Node>;
  onToggleHistory: () => void;
}) {
  const t = useTranslation();
  return (
    <>
      <AssistantHomeHeader
        historyVisible={props.historyVisible}
        onNewThread={props.controller.handleNewThread}
        onToggleHistory={props.onToggleHistory}
      />
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
    </>
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
        loading={props.controller.loading}
      />
    </>
  );
}

function AssistantThreadStatus(props: { empty: boolean; loading: boolean }) {
  const t = useTranslation();
  const text = props.loading
    ? t('desktop.rightPanel.assistant.loading')
    : props.empty
      ? t('desktop.rightPanel.assistant.empty')
      : null;
  if (!text) return null;
  return (
    <p className={`${inspectorListInsetPaddingClassName} py-3 ${inspectorListMetaClassName}`}>
      {text}
    </p>
  );
}

function isConversationOpen(
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>
) {
  return controller.selectedThreadId !== null || controller.activeMessages.length > 0 || controller.sending;
}

function resolveSessionLabel(
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>,
  t: ReturnType<typeof useTranslation>
) {
  return controller.selectedRecord && controller.activeMessages.length === 0
    ? t('desktop.rightPanel.assistant.selectedThread')
    : t('desktop.rightPanel.assistant.currentSession');
}
